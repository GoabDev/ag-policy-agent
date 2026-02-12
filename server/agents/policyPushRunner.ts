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

// Running push tasks
const runningPushTasks: Map<string, PolicyPushTask> = new Map();
const pushTaskHistory: PolicyPushTask[] = [];

// ============================================
// Helpers
// ============================================

function addStep(task: PolicyPushTask, step: PolicyPushStep) {
  task.steps.push(step);
  emitEvent("push:step", { taskId: task.id, step });
}

function createStep(
  site: "ag" | "niid_push",
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
  input: PolicyPushInput
): Promise<PolicyPushTask> {
  const task: PolicyPushTask = {
    id: uuid(),
    input,
    status: "running",
    steps: [],
    createdAt: new Date().toISOString(),
  };

  const label =
    input.method === "policy_number"
      ? `policy: ${input.policyNumber}`
      : `date range: ${input.fromDate} to ${input.toDate}`;

  runningPushTasks.set(task.id, task);
  emitEvent("push:started", { taskId: task.id, method: input.method, label });
  log(`Starting policy push task: ${task.id} (${label})`);

  try {
    // Step 1: Get A&G spool page
    const agPage = await getAGSpoolPage();
    addStep(task, createStep("ag", "A&G spool page ready", "success"));

    // Step 2: Download XLSX from A&G
    let downloadedFilePath: string;

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
        "ag",
        "Policy file downloaded",
        "success",
        path.basename(downloadedFilePath)
      )
    );

    // Step 3: Process XLSX — rename sheet to "Sheet1"
    const processedDir = path.join(config.storagePath, "downloads", "processed");
    if (!fs.existsSync(processedDir)) {
      fs.mkdirSync(processedDir, { recursive: true });
    }

    const processedFilePath = path.join(
      processedDir,
      `processed_${path.basename(downloadedFilePath)}`
    );
    renameSheetToSheet1(downloadedFilePath, processedFilePath);
    addStep(
      task,
      createStep(
        "ag",
        "XLSX sheet renamed to Sheet1",
        "success",
        path.basename(processedFilePath)
      )
    );

    // Step 4: Get NIID upload page
    const niidPage = await getNIIDUploadPage();
    addStep(task, createStep("niid_push", "NIID upload page ready", "success"));

    // Step 5: Upload processed file to NIID
    await uploadPolicyFile(niidPage, processedFilePath);
    addStep(
      task,
      createStep("niid_push", "Policy file uploaded to NIID", "success")
    );

    // Step 6: Clean up temp files
    try {
      fs.unlinkSync(downloadedFilePath);
      fs.unlinkSync(processedFilePath);
    } catch {
      // Non-critical if cleanup fails
    }

    task.status = "completed";
    task.completedAt = new Date().toISOString();
    emitEvent("push:completed", { taskId: task.id });
    log(`Policy push task completed: ${task.id}`);
  } catch (err: any) {
    task.status = "failed";
    task.error = err.message;
    task.completedAt = new Date().toISOString();
    addStep(task, createStep("ag", "error", "failed", err.message));
    emitEvent("push:failed", { taskId: task.id, error: err.message });
    log(`Policy push task failed: ${task.id} — ${err.message}`, "error");
  }

  // Save to history
  runningPushTasks.delete(task.id);
  pushTaskHistory.unshift(task);
  saveTaskLog(task.id, task);

  return task;
}

// ============================================
// Getters
// ============================================

export function getRunningPushTasks(): PolicyPushTask[] {
  return Array.from(runningPushTasks.values());
}

export function getPushTaskHistory(): PolicyPushTask[] {
  return pushTaskHistory;
}
