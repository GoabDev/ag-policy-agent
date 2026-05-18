import { v4 as uuid } from "uuid";
import fs from "fs";
import path from "path";
import {
  PolicyPushInput,
  PolicyPushTask,
  PolicyPushStep,
} from "../types";
import { log, emitEvent, saveTaskLog } from "../utils/logger";
import {
  getAGSpoolPage,
  downloadByPolicyNumber,
  downloadByDateRange,
} from "../browser/actions/policy-push/ag";
import {
  getNIIDUploadPage,
  uploadPolicyFile,
} from "../browser/actions/policy-push/niid";
import { renameSheetToSheet1 } from "../utils/xlsxProcessor";
import { config } from "../config";
import { touchWorkActivity } from "../browser/controller";
import { isEpinPolicyNumber } from "../utils/policyClassifier";

export interface PolicyPushSessionSites {
  ag: "ag_push" | "ag_auto_push";
  niid: "niid_push" | "niid_auto_push";
}

export interface PolicyPushRunMetadata {
  source?: "manual" | "automated";
  automationRunId?: string;
  automationMode?: "current_day" | "year_to_date";
}

const MANUAL_PUSH_SITES: PolicyPushSessionSites = {
  ag: "ag_push",
  niid: "niid_push",
};

// Running push tasks
const runningPushTasks: Map<string, PolicyPushTask> = new Map();
const abortControllers: Map<string, AbortController> = new Map();
const pushTaskHistory: PolicyPushTask[] = [];

class CancellationError extends Error {
  constructor() {
    super('Task cancelled by user');
    this.name = 'CancellationError';
  }
}

function checkCancelled(signal: AbortSignal) {
  if (signal.aborted) throw new CancellationError();
}

// ============================================
// Helpers
// ============================================

function addStep(task: PolicyPushTask, step: PolicyPushStep) {
  task.steps.push(step);
  emitEvent("push:step", { taskId: task.id, step });
}

function createStep(
  site: "ag" | "ag_push" | "niid_push" | "ag_auto_push" | "niid_auto_push",
  action: string,
  status: "success" | "failed" | "skipped",
  details?: string
): PolicyPushStep {
  return {
    timestamp: new Date().toISOString(),
    site,
    action,
    status,
    details,
  };
}

// ============================================
// Run Policy Push
// ============================================

export async function runPolicyPush(
  input: PolicyPushInput,
  sites: PolicyPushSessionSites = MANUAL_PUSH_SITES,
  metadata: PolicyPushRunMetadata = {},
): Promise<PolicyPushTask> {
  if (input.method === "policy_number" && isEpinPolicyNumber(input.policyNumber)) {
    throw new Error("E-pin policies are not supported for policy push");
  }

  const task: PolicyPushTask = {
    id: uuid(),
    input,
    source: metadata.source || "manual",
    automationRunId: metadata.automationRunId,
    automationMode: metadata.automationMode,
    status: "running",
    steps: [],
    createdAt: new Date().toISOString(),
  };

  const controller = new AbortController();
  const signal = controller.signal;

  const label =
    input.method === "policy_number"
      ? `policy: ${input.policyNumber}`
      : `date range: ${input.fromDate} to ${input.toDate}`;

  runningPushTasks.set(task.id, task);
  abortControllers.set(task.id, controller);
  emitEvent("push:started", { taskId: task.id, method: input.method, label });
  log(`Starting policy push task: ${task.id} (${label})`);

  // Reset inactivity timer — real work is happening
  touchWorkActivity(sites.ag);
  touchWorkActivity(sites.niid);

  // Track files for cleanup on cancellation
  let downloadedFilePath: string | undefined;
  let processedFilePath: string | undefined;

  try {
    checkCancelled(signal);

    // Step 1: Get A&G spool page
    const agPage = await getAGSpoolPage(sites.ag);
    addStep(task, createStep(sites.ag, "A&G spool page ready", "success"));
    checkCancelled(signal);

    // Step 2: Download XLSX from A&G
    if (input.method === "policy_number") {
      downloadedFilePath = await downloadByPolicyNumber(
        agPage,
        input.policyNumber
      );
    } else {
      downloadedFilePath = await downloadByDateRange(
        agPage,
        input.fromDate,
        input.toDate
      );
    }

    task.downloadedFile = downloadedFilePath;
    addStep(
      task,
      createStep(
        sites.ag,
        "Policy file downloaded",
        "success",
        path.basename(downloadedFilePath)
      )
    );
    checkCancelled(signal);

    // Step 3: Process XLSX — rename sheet to "Sheet1"
    const processedDir = path.join(config.storagePath, "downloads", "processed");
    if (!fs.existsSync(processedDir)) {
      fs.mkdirSync(processedDir, { recursive: true });
    }

    const downloadedName = path.parse(downloadedFilePath).name;
    processedFilePath = path.join(processedDir, `processed_${downloadedName}.xlsx`);
    const sheetRename = renameSheetToSheet1(downloadedFilePath, processedFilePath);
    addStep(
      task,
      createStep(
        sites.ag,
        "XLSX sheet renamed to Sheet1",
        "success",
        `${sheetRename.previousSheetName} -> ${sheetRename.outputSheetName} (${path.basename(processedFilePath)})`
      )
    );
    checkCancelled(signal);

    // Step 4: Get NIID upload page
    const niidPage = await getNIIDUploadPage(sites.niid);
    addStep(task, createStep(sites.niid, "NIID upload page ready", "success"));
    checkCancelled(signal);

    // Step 5: Upload processed file to NIID
    const uploadResult = await uploadPolicyFile(niidPage, processedFilePath);
    task.uploadResult = uploadResult.resultText;
    task.uploadHasResults = uploadResult.hasResults;

    if (uploadResult.hasResults) {
      addStep(
        task,
        createStep(sites.niid, "Policy file uploaded to NIID", "success", uploadResult.resultText)
      );
    } else {
      addStep(
        task,
        createStep(sites.niid, "Upload completed but NIID returned no result", "failed", uploadResult.resultText)
      );
    }

    // Step 6: Clean up temp files
    try {
      fs.unlinkSync(downloadedFilePath);
      fs.unlinkSync(processedFilePath);
    } catch {
      // Non-critical if cleanup fails
    }

    task.status = "completed";
    task.completedAt = new Date().toISOString();
    log(`Policy push task completed: ${task.id}`);
  } catch (err: any) {
    // Clean up downloaded/processed files on cancellation or failure
    try {
      if (downloadedFilePath && fs.existsSync(downloadedFilePath)) fs.unlinkSync(downloadedFilePath);
      if (processedFilePath && fs.existsSync(processedFilePath)) fs.unlinkSync(processedFilePath);
    } catch { /* non-critical */ }

    if (err instanceof CancellationError) {
      task.status = "cancelled";
      task.completedAt = new Date().toISOString();
      addStep(task, createStep(sites.ag, "Task cancelled by user", "failed"));
      log(`Policy push task cancelled: ${task.id}`);
    } else {
      task.status = "failed";
      task.error = err.message;
      task.completedAt = new Date().toISOString();
      addStep(task, createStep(sites.ag, "error", "failed", err.message));
      log(`Policy push task failed: ${task.id} — ${err.message}`, "error");
    }
  }

  // Save to history
  runningPushTasks.delete(task.id);
  abortControllers.delete(task.id);
  pushTaskHistory.unshift(task);
  saveTaskLog(task.id, task);

  if (task.status === "completed") {
    emitEvent("push:completed", { taskId: task.id });
  } else if (task.status === "cancelled") {
    emitEvent("push:cancelled", { taskId: task.id });
  } else {
    emitEvent("push:failed", { taskId: task.id, error: task.error });
  }

  return task;
}

// ============================================
// Getters
// ============================================

export function cancelPolicyPush(taskId: string): boolean {
  const controller = abortControllers.get(taskId);
  if (!controller) return false;
  controller.abort();
  return true;
}

export function getRunningPushTasks(): PolicyPushTask[] {
  return Array.from(runningPushTasks.values());
}

export function getPushTaskHistory(): PolicyPushTask[] {
  return pushTaskHistory;
}
