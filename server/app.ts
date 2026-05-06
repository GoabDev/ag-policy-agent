import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { config } from "./config";
import { addSSEClient, log, loadTaskLogs } from "./utils/logger";
import {
  getSessionStatus,
  closeBrowser,
  clearAllSessions,
} from "./browser/controller";
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
import {
  closePolicyStatus,
  getPolicyStatusHistory,
  resetPolicyStatus,
  startPolicyStatus,
  trackPolicyStatus,
} from "./agents/policyStatusRunner";
import { getPoolStatus, destroyAllWorkers } from "./browser/workerPool";
import { CorrectionInput, PolicyPushInput, PolicyStatusInput } from "./types";
import {
  cancelPolicyPush,
  getRunningPushTasks,
  getPushTaskHistory,
} from "./agents/policyPushRunner";
import {
  enqueuePolicyPush,
  getPolicyPushQueueStatus,
} from "./agents/policyPushQueue";
import {
  getAutomatedAgentLogs,
  getAutomatedAgentLogsPage,
  getAutomatedAgentStatus,
  continueYearToDateAgent,
  startCurrentDayAgent,
  startYearToDateAgent,
  stopAutomatedAgent,
} from "./agents/automatedPolicyAgent";
import {
  loginAutomatedAgent,
  requireAutomatedAgentAuth,
} from "./agents/automatedAgentAuth";
import { loadSettings, getSettings, saveSettings } from "./settings";
import {
  startLogCleanup,
  stopLogCleanup,
  runLogCleanup,
  getCleanableLogCount,
} from "./jobs/logCleanup";
import { isEpinPolicyNumber } from "./utils/policyClassifier";

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
      policyPushQueue: getPolicyPushQueueStatus(),
      sessions: {
        ag: getSessionStatus("ag"),
        ag_push: getSessionStatus("ag_push"),
        epin: getSessionStatus("epin"),
        niid: getSessionStatus("niid"),
        niip: getSessionStatus("niip"),
        niid_push: getSessionStatus("niid_push"),
        ag_auto_push: getSessionStatus("ag_auto_push"),
        niid_auto_push: getSessionStatus("niid_auto_push"),
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
      case "swap": {
        const swapFields = [
          (input as any).firstName,
          (input as any).lastName,
          (input as any).email,
          (input as any).phone,
          (input as any).engineNumber,
          (input as any).newChassisNumber,
          (input as any).newRegistrationNumber,
          (input as any).vehicleColor,
          (input as any).newVehicleMake,
          (input as any).newVehicleModel,
          (input as any).vehicleYear,
          (input as any).address,
        ];

        const hasAnyValue = swapFields.some(
          (value) => typeof value === "string" && value.trim().length > 0,
        );

        if (!hasAnyValue) {
          return res.status(400).json({
            success: false,
            error: "Provide at least one swap field to update",
          });
        }
        break;
      }
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

app.post("/api/sessions/login-epin", async (req, res) => {
  try {
    const { loginToEPIN } = await import("./browser/actions/epin");
    await loginToEPIN();
    startHeartbeat("epin");
    res.json({
      success: true,
      data: { message: "Logged into E-PIN successfully" },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/sessions/login-niip", async (req, res) => {
  try {
    const { loginToNIIP } = await import("./browser/actions/niip");
    await loginToNIIP();
    startHeartbeat("niip");
    res.json({
      success: true,
      data: { message: "Logged into NIIP successfully" },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/sessions/login-epin-all", async (req, res) => {
  try {
    const { loginToEPIN } = await import("./browser/actions/epin");
    const { loginToNIIP } = await import("./browser/actions/niip");

    await Promise.all([loginToEPIN(), loginToNIIP()]);
    startHeartbeat("epin");
    startHeartbeat("niip");

    res.json({
      success: true,
      data: { message: "Logged into E-PIN and NIIP successfully" },
    });
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

    if (
      input.method === "policy_number" &&
      input.policyNumber &&
      isEpinPolicyNumber(input.policyNumber)
    ) {
      return res.status(400).json({
        success: false,
        error: "E-pin policies are not supported for policy push",
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
    const taskPromise = enqueuePolicyPush(input, "manual");

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
  const fileLogs = loadTaskLogs().filter(
    (t) =>
      t.input &&
      typeof t.input.method === "string" &&
      (t.input.method === "policy_number" || t.input.method === "date_range"),
  ); // Only push logs

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

app.post("/api/pol-status/start", (req, res) => {
  try {
    const rawLookupValue =
      req.body.lookupValue || req.body.policyNumber || req.body.registrationNumber;
    const input: PolicyStatusInput = {
      lookupValue: typeof rawLookupValue === "string" ? rawLookupValue : "",
      lookupType: req.body.lookupType,
    };

    if (!input.lookupValue || input.lookupValue.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: "Missing required field: lookupValue",
      });
    }

    const task = startPolicyStatus({
      lookupValue: input.lookupValue.trim(),
      lookupType: input.lookupType,
    });

    res.json({
      success: true,
      data: {
        taskId: task.id,
        message: "Policy status task queued",
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/pol-status/:taskId/close", async (req, res) => {
  try {
    const closed = await closePolicyStatus(req.params.taskId);
    if (!closed) {
      return res
        .status(404)
        .json({ success: false, error: "Policy status task not found" });
    }

    res.json({ success: true, data: { message: "Policy status task closed" } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/pol-status/:taskId/reset", async (req, res) => {
  try {
    const reset = await resetPolicyStatus(req.params.taskId);
    if (!reset) {
      return res
        .status(404)
        .json({ success: false, error: "Policy status task not found" });
    }

    res.json({ success: true, data: { message: "Policy status reset started" } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/pol-status/:taskId/track", async (req, res) => {
  try {
    const tracked = await trackPolicyStatus(req.params.taskId);
    if (!tracked) {
      return res
        .status(404)
        .json({ success: false, error: "Policy status task not found" });
    }

    res.json({ success: true, data: { message: "Scratch-card track started" } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/api/pol-status/logs", (req, res) => {
  const history = getPolicyStatusHistory();
  const fileLogs = loadTaskLogs().filter(
    (t) =>
      t.input &&
      typeof t.input.lookupValue === "string" &&
      t.result &&
      !t.correction,
  );
  const seen = new Set(history.map((t) => t.id));
  const merged = [...history, ...fileLogs.filter((t) => !seen.has(t.id))];
  res.json({ success: true, data: merged });
});

// Stop heartbeats, kill all browser sessions, close all browsers, and delete saved sessions
app.post("/api/sessions/stop-all", async (req, res) => {
  try {
    stopAutomatedAgent();
    stopAllHeartbeats();

    const { closeManualLoginPopups } = await import("./browser/manualLogin");
    await closeManualLoginPopups();
    await destroyAllWorkers();
    await clearAllSessions();

    res.json({
      success: true,
      data: { message: "All sessions stopped and browser windows closed" },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================
// Automated Agent
// ============================================

app.post("/api/automated-agent/login", (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      error: "Email and password are required",
    });
  }

  const session = loginAutomatedAgent(email, password);
  if (!session) {
    return res.status(401).json({
      success: false,
      error: "Invalid Automated Agent login",
    });
  }

  res.json({ success: true, data: session });
});

app.get(
  "/api/automated-agent/status",
  requireAutomatedAgentAuth,
  (req, res) => {
    res.json({ success: true, data: getAutomatedAgentStatus() });
  },
);

app.post(
  "/api/automated-agent/current-day/start",
  requireAutomatedAgentAuth,
  (req, res) => {
    try {
      startCurrentDayAgent();
      res.json({
        success: true,
        data: { message: "Current-day automated agent started" },
      });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  },
);

app.post(
  "/api/automated-agent/year-to-date/start",
  requireAutomatedAgentAuth,
  (req, res) => {
    try {
      startYearToDateAgent();
      res.json({
        success: true,
        data: { message: "Year-to-date automated agent started" },
      });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  },
);

app.post(
  "/api/automated-agent/year-to-date/continue",
  requireAutomatedAgentAuth,
  (req, res) => {
    try {
      continueYearToDateAgent();
      res.json({
        success: true,
        data: { message: "Year-to-date automated agent continued" },
      });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  },
);

app.post(
  "/api/automated-agent/stop",
  requireAutomatedAgentAuth,
  (req, res) => {
    const stopped = stopAutomatedAgent();
    res.json({
      success: true,
      data: {
        message: stopped
          ? "Automated agent stop requested"
          : "No automated agent is running",
      },
    });
  },
);

app.get(
  "/api/automated-agent/logs",
  requireAutomatedAgentAuth,
  (req, res) => {
    const page = Number(req.query.page || 1);
    const pageSize = Number(req.query.pageSize || 20);
    res.json({ success: true, data: getAutomatedAgentLogsPage(page, pageSize) });
  },
);

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

// Login dedicated automated push sessions
app.post("/api/sessions/login-automated-push", async (req, res) => {
  try {
    const { loginToAG } = await import("./browser/actions/ag");
    const { openLoginPopup } = await import("./browser/manualLogin");

    res.json({
      success: true,
      data: {
        message:
          "Automated push login started. Complete NIID login in the browser window.",
      },
    });

    await loginToAG("ag_auto_push");
    startHeartbeat("ag_auto_push");

    const niidSuccess = await openLoginPopup("niid_auto_push");
    if (niidSuccess) startHeartbeat("niid_auto_push");
  } catch (err: any) {
    log(`Automated push login failed: ${err.message}`, "error");
  }
});

app.post("/api/sessions/login-automated-niid-push", async (req, res) => {
  try {
    const { openLoginPopup } = await import("./browser/manualLogin");
    res.json({
      success: true,
      data: {
        message:
          "Automated NIID Push login popup opened. Complete login in the browser window.",
      },
    });

    const success = await openLoginPopup("niid_auto_push");
    if (success) startHeartbeat("niid_auto_push");
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
  for (const dir of [config.storagePath, config.logsPath, config.automatedLogsPath]) {
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

process.on("unhandledRejection", (reason) => {
  const message =
    reason instanceof Error ? `${reason.name}: ${reason.message}` : String(reason);
  log(`Unhandled promise rejection: ${message}`, "error");
});

process.on("uncaughtException", (err) => {
  log(`Uncaught exception: ${err.message}`, "error");
});

// ============================================
// Start Server
// ============================================

const server = app.listen(config.port, () => {
  const actualPort = (server.address() as any).port;
  const portFile = process.env.SERVER_PORT_FILE;

  if (portFile) {
    try {
      fs.writeFileSync(portFile, String(actualPort), "utf-8");
    } catch (err: any) {
      log(`Failed to write startup port file: ${err.message}`, "error");
    }
  }

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
  setTimeout(() => {
    try {
      startAllHeartbeats();
    } catch (err: any) {
      log(`Failed to start saved-session heartbeats: ${err.message}`, "error");
    }
  }, 0);
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
