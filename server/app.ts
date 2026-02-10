import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { config } from "./config";
import { addSSEClient, log, loadTaskLogs } from "./utils/logger";
import { getSessionStatus, closeBrowser } from "./browser/controller";
import {
  startAllHeartbeats,
  stopAllHeartbeats,
  startHeartbeat,
} from "./browser/keepAlive";
import {
  runCorrection,
  getRunningTasks,
  getTaskHistory,
} from "./agents/correctionRunner";
import { getPoolStatus, destroyAllWorkers } from "./browser/workerPool";
import { CorrectionInput } from "./types";

const app = express();
app.use(cors());
app.use(express.json());

// Serve dashboard
app.use(express.static(config.dashboardPath));

const startTime = Date.now();

// ============================================
// API Routes
// ============================================

// Agent status
app.get("/api/status", (req, res) => {
  const running = getRunningTasks();
  res.json({
    success: true,
    data: {
      isRunning: running.length > 0,
      runningTasks: running,
      workerPool: getPoolStatus(),
      sessions: {
        ag: getSessionStatus("ag"),
        niid: getSessionStatus("niid"),
      },
      uptime: Math.floor((Date.now() - startTime) / 1000),
    },
  });
});

// Submit a correction task
app.post("/api/corrections/run", async (req, res) => {
  try {
    const input: CorrectionInput = req.body;

    // Basic validation
    if (!input.type || !input.policyNumber) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: type and policyNumber",
      });
    }

    // Validate based on type
    switch (input.type) {
      case "name":
        if (!(input as any).newName) {
          return res
            .status(400)
            .json({ success: false, error: "Missing newName" });
        }
        break;
      case "registration":
        if (!(input as any).newRegistrationNumber) {
          return res
            .status(400)
            .json({ success: false, error: "Missing newRegistrationNumber" });
        }
        break;
      case "vehicle_make":
        if (!(input as any).newVehicleMake) {
          return res
            .status(400)
            .json({ success: false, error: "Missing newVehicleMake" });
        }
        break;
      default:
        return res
          .status(400)
          .json({
            success: false,
            error: `Unknown type: ${(input as any).type}`,
          });
    }

    // Generate task ID upfront, start correction in background, respond immediately
    const taskPromise = runCorrection(input);

    // Don't await — let it run in background. The task ID comes from the SSE events.
    // We respond immediately so the client isn't blocked.
    taskPromise
      .then((task) => {
        log(`Task ${task.id} finished with status: ${task.status}`);
      })
      .catch((err) => {
        log(`Task failed unexpectedly: ${err.message}`, "error");
      });

    res.json({
      success: true,
      data: { message: "Correction task queued" },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get correction history
app.get("/api/corrections/logs", (req, res) => {
  const history = getTaskHistory();
  const fileLogs = loadTaskLogs();

  // Merge in-memory and file-based logs (deduplicate by id)
  const seen = new Set(history.map((t) => t.id));
  const merged = [...history, ...fileLogs.filter((t) => !seen.has(t.id))];

  res.json({ success: true, data: merged });
});

// Login to A&G (auto)
app.post("/api/sessions/login-ag", async (req, res) => {
  try {
    const { loginToAG } = await import("./browser/actions/ag");
    await loginToAG();
    startHeartbeat("ag");
    res.json({
      success: true,
      data: { message: "Logged into A&G successfully" },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Open a headed browser popup for manual NIID login
app.post("/api/sessions/login-niid", async (req, res) => {
  try {
    const { openLoginPopup } = await import("./browser/manualLogin");
    res.json({
      success: true,
      data: {
        message:
          "Login popup opened — please complete login in the browser window.",
      },
    });

    const success = await openLoginPopup("niid");
    if (success) {
      startHeartbeat("niid");
    }
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Trigger keepalive
app.post("/api/sessions/keepalive", async (req, res) => {
  try {
    startAllHeartbeats();
    res.json({ success: true, data: { message: "Heartbeats started" } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================
// SSE Endpoint for live updates
// ============================================

app.get("/api/stream", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  // Send initial connected event
  res.write(
    `data: ${JSON.stringify({ type: "connected", timestamp: new Date().toISOString() })}\n\n`,
  );

  addSSEClient(res);
});

// ============================================
// Health Check
// ============================================

app.get("/health", (req, res) => res.json({ status: "ok" }));

// Check if Chrome is installed on the system
app.get("/api/check-browser", (req, res) => {
  const chromePaths: string[] =
    process.platform === "win32"
      ? [
          path.join(process.env.PROGRAMFILES || "", "Google/Chrome/Application/chrome.exe"),
          path.join(process.env["PROGRAMFILES(X86)"] || "", "Google/Chrome/Application/chrome.exe"),
          path.join(process.env.LOCALAPPDATA || "", "Google/Chrome/Application/chrome.exe"),
        ]
      : [
          "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
          "/usr/bin/google-chrome",
          "/usr/bin/google-chrome-stable",
        ];

  const found = chromePaths.some((p) => fs.existsSync(p));

  res.json({
    success: true,
    data: {
      installed: found,
      browser: "Google Chrome",
      platform: process.platform,
    },
  });
});

// ============================================
// Fallback: serve frontend for non-API routes
// ============================================

app.get("/{*path}", (req, res) => {
  const filePath = path.join(config.dashboardPath, req.path);
  res.sendFile(filePath, (err) => {
    res.sendFile(filePath + ".html", (err2) => {
      res.sendFile(path.join(filePath, "index.html"), (err3) => {
        res.sendFile(path.join(config.dashboardPath, "index.html"));
      });
    });
  });
});

// ============================================
// Start Server
// ============================================

const server = app.listen(config.port, () => {
  const actualPort = (server.address() as any).port;
  console.log(`
  ╔══════════════════════════════════════════════╗
  ║   A&G Policy Correction Agent                ║
  ║                                              ║
  ║   Dashboard: http://localhost:${actualPort}          ║
  ║   API:       http://localhost:${actualPort}/api      ║
  ║                                              ║
  ║   Status: RUNNING                            ║
  ╚══════════════════════════════════════════════╝
  `);

  // Start heartbeats for any existing sessions
  startAllHeartbeats();
});

// Graceful shutdown
process.on("SIGINT", async () => {
  log("Shutting down...");
  stopAllHeartbeats();
  await destroyAllWorkers();
  await closeBrowser();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  stopAllHeartbeats();
  await destroyAllWorkers();
  await closeBrowser();
  process.exit(0);
});
