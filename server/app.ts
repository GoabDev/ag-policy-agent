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
  cancelCorrection,
  getRunningTasks,
  getTaskHistory,
} from "./agents/correctionRunner";
import { getPoolStatus, destroyAllWorkers } from "./browser/workerPool";
import { CorrectionInput, PolicyPushInput } from "./types";
import {
  runPolicyPush,
  cancelPolicyPush,
  getRunningPushTasks,
  getPushTaskHistory,
} from "./agents/policyPushRunner";
import { loadSettings, getSettings, saveSettings } from "./settings";
import {
  startLogCleanup,
  stopLogCleanup,
  runLogCleanup,
  getCleanableLogCount,
} from "./jobs/logCleanup";

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
        ag_push: getSessionStatus("ag_push"),
        niid: getSessionStatus("niid"),
        niid_push: getSessionStatus("niid_push"),
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
        if (!(input as any).firstName || !(input as any).lastName) {
          return res
            .status(400)
            .json({ success: false, error: "Missing firstName or lastName" });
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
      case "reg_and_chassis":
        if (
          !(input as any).newRegistrationNumber ||
          !(input as any).newChassisNumber
        ) {
          return res.status(400).json({
            success: false,
            error: "Missing newRegistrationNumber or newChassisNumber",
          });
        }
        break;
      case "chassis":
        if (!(input as any).newChassisNumber) {
          return res
            .status(400)
            .json({ success: false, error: "Missing newChassisNumber" });
        }
        break;
      default:
        return res.status(400).json({
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

// Cancel a running correction task
app.post("/api/corrections/:taskId/cancel", (req, res) => {
  const { taskId } = req.params;
  const cancelled = cancelCorrection(taskId);
  if (cancelled) {
    res.json({ success: true, data: { message: "Cancellation requested" } });
  } else {
    res.status(404).json({ success: false, error: "Task not found or already finished" });
  }
});

// Get correction history
app.get("/api/corrections/logs", (req, res) => {
  const history = getTaskHistory();
  const fileLogs = loadTaskLogs().filter((t) => t.correction); // Only correction logs

  // Merge in-memory and file-based logs (deduplicate by id)
  const seen = new Set(history.map((t) => t.id));
  const merged = [...history, ...fileLogs.filter((t) => !seen.has(t.id))];

  res.json({ success: true, data: merged });
});

// Login to A&G (auto — sets up both correction and push pages)
app.post("/api/sessions/login-ag", async (req, res) => {
  try {
    const { loginToAG } = await import("./browser/actions/ag");
    await loginToAG();
    startHeartbeat("ag"); // Single heartbeat covers both ag and ag_push pages
    res.json({
      success: true,
      data: { message: "Logged into A&G successfully (corrections + push)" },
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

// Vehicle makes & models data
app.get("/api/vehicle-data", async (req, res) => {
  try {
    const { fetchVehicleData, getModelFetchStatus } =
      await import("./browser/actions/ag");
    const forceRefresh = req.query.refresh === "true";
    const data = await fetchVehicleData(forceRefresh);
    res.json({ success: true, data, modelFetchStatus: getModelFetchStatus() });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================
// Policy Push
// ============================================

// Submit a policy push task
app.post("/api/policy-push/run", async (req, res) => {
  try {
    const input: PolicyPushInput = req.body;

    if (!input.method) {
      return res.status(400).json({
        success: false,
        error: "Missing required field: method (policy_number or date_range)",
      });
    }

    if (input.method === "policy_number" && !input.policyNumber) {
      return res.status(400).json({
        success: false,
        error: "Missing required field: policyNumber",
      });
    }

    if (input.method === "date_range") {
      if (!input.fromDate || !input.toDate) {
        return res.status(400).json({
          success: false,
          error: "Missing required fields: fromDate and toDate",
        });
      }
    }

    // Run in background
    const taskPromise = runPolicyPush(input);

    taskPromise
      .then((task) => {
        log(`Policy push task ${task.id} finished with status: ${task.status}`);
      })
      .catch((err) => {
        log(`Policy push task failed unexpectedly: ${err.message}`, "error");
      });

    res.json({
      success: true,
      data: { message: "Policy push task queued" },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Cancel a running policy push task
app.post("/api/policy-push/:taskId/cancel", (req, res) => {
  const { taskId } = req.params;
  const cancelled = cancelPolicyPush(taskId);
  if (cancelled) {
    res.json({ success: true, data: { message: "Cancellation requested" } });
  } else {
    res.status(404).json({ success: false, error: "Task not found or already finished" });
  }
});

// Get policy push history
app.get("/api/policy-push/logs", (req, res) => {
  const running = getRunningPushTasks();
  const history = getPushTaskHistory();
  const fileLogs = loadTaskLogs().filter((t) => t.input); // Only push logs

  // Merge all sources, deduplicate by id (in-memory takes precedence)
  const seen = new Set<string>();
  const merged: any[] = [];
  for (const list of [running, history, fileLogs]) {
    for (const t of list) {
      if (!seen.has(t.id)) {
        seen.add(t.id);
        merged.push(t);
      }
    }
  }

  res.json({ success: true, data: merged });
});

// Open a headed browser popup for manual NIID Push login
app.post("/api/sessions/login-niid-push", async (req, res) => {
  try {
    const { openLoginPopup } = await import("./browser/manualLogin");
    res.json({
      success: true,
      data: {
        message:
          "NIID Push login popup opened — please complete login in the browser window.",
      },
    });

    const success = await openLoginPopup("niid_push");
    if (success) {
      startHeartbeat("niid_push");
    }
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Open both NIID + NIID Push login popups at the same time
app.post("/api/sessions/login-niid-all", async (req, res) => {
  try {
    const { openLoginPopup } = await import("./browser/manualLogin");
    res.json({
      success: true,
      data: {
        message:
          "Both NIID login popups opened — please complete login in both browser windows.",
      },
    });

    // Launch both popups in parallel
    const [niidSuccess, niidPushSuccess] = await Promise.all([
      openLoginPopup("niid"),
      openLoginPopup("niid_push"),
    ]);

    if (niidSuccess) startHeartbeat("niid");
    if (niidPushSuccess) startHeartbeat("niid_push");
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================
// Settings
// ============================================

app.get("/api/settings", (req, res) => {
  res.json({ success: true, data: getSettings() });
});

app.put("/api/settings", (req, res) => {
  try {
    const updated = saveSettings(req.body);
    res.json({ success: true, data: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/settings/clean-logs", (req, res) => {
  try {
    const result = runLogCleanup();
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/api/settings/log-stats", (req, res) => {
  res.json({ success: true, data: getCleanableLogCount() });
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
// Startup: ensure storage dirs & clean stale downloads
// ============================================

function initStorage(): void {
  // Ensure required directories exist
  for (const dir of [config.storagePath, config.logsPath]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  // Clean up any orphaned download files left from a previous crash
  const downloadsDir = path.join(config.storagePath, "downloads");
  if (fs.existsSync(downloadsDir)) {
    try {
      fs.rmSync(downloadsDir, { recursive: true, force: true });
      log("Cleaned up stale downloads directory");
    } catch {
      // Non-critical
    }
  }
}

initStorage();

// Load user settings (overrides .env defaults)
loadSettings();

// Start periodic log cleanup
startLogCleanup();

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
  stopLogCleanup();
  stopAllHeartbeats();
  await destroyAllWorkers();
  await closeBrowser();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  stopLogCleanup();
  stopAllHeartbeats();
  await destroyAllWorkers();
  await closeBrowser();
  process.exit(0);
});
