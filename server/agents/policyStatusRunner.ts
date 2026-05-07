import { v4 as uuid } from "uuid";
import { Page } from "playwright";
import {
  PolicyStatusChannel,
  PolicyStatusInput,
  PolicyStatusTask,
  TaskStep,
  Worker,
} from "../types";
import { acquireWorker, getWorkerById, releaseWorker } from "../browser/workerPool";
import { config } from "../config";
import {
  extractAGPolicyStatusDetails,
  extractAGPolicyStatusSummary,
  loginToAG,
  openAGPolicyStatusPage,
  searchAGPolicyStatus,
  trackAGPolicyStatusDetails,
} from "../browser/actions/ag";
import {
  extractEPINPolicyStatusDetails,
  extractEPINPolicyStatus,
  openEPINPolicyStatusPage,
  resetEPINPolicyStatusPush,
  searchEPINPolicyStatus,
  trackEPINPolicyStatusDetails,
} from "../browser/actions/epin";
import { emitEvent, log, saveTaskLog } from "../utils/logger";
import { touchSession, touchWorkActivity } from "../browser/controller";
import { isEpinPolicyNumber } from "../utils/policyClassifier";

const activePolicyStatusTasks: Map<string, PolicyStatusTask> = new Map();
const policyStatusHistory: PolicyStatusTask[] = [];
const taskWorkers: Map<string, string> = new Map();

function detectPolicyStatusLookupType(
  lookupValue: string,
): "policy_number" | "registration" | "certificate" {
  const trimmed = lookupValue.trim();
  if (/^P\/AG\//i.test(trimmed)) return "policy_number";
  if (/^\d+$/.test(trimmed)) return "certificate";
  return "registration";
}

function detectPolicyStatusChannel(
  lookupValue: string,
  lookupType: "policy_number" | "registration" | "certificate",
): PolicyStatusChannel {
  if (lookupType === "certificate") return "scratch_card";
  if (lookupType === "registration") return "epin";
  return isEpinPolicyNumber(lookupValue) ? "epin" : "scratch_card";
}

function createStep(
  action: string,
  status: "success" | "failed" | "skipped",
  details?: string,
): TaskStep {
  return {
    timestamp: new Date().toISOString(),
    site: "epin",
    action,
    status,
    details,
  };
}

function addStep(task: PolicyStatusTask, step: TaskStep) {
  task.steps.push(step);
  emitEvent("polstatus:step", { taskId: task.id, step });
}

async function prepareWorkerEPINStatusPage(worker: Worker): Promise<Page> {
  const page = worker.pages.get("epin");
  if (!page) {
    throw new Error("E-PIN worker page is unavailable");
  }

  const currentUrl = page.url().toLowerCase();

  if (currentUrl.includes("/account/login")) {
    log(`Worker ${worker.id}: E-PIN status session expired, re-logging in...`, "warn");
    await page.goto(config.epin.url, { waitUntil: "networkidle" });
    await page.fill('input[name="Username"]', config.epin.username);
    await page.fill('input[name="Password"]', config.epin.password);
    await page.click('button[type="submit"]');
  }

  await openEPINPolicyStatusPage(page);
  touchSession("epin");
  return page;
}

async function prepareWorkerCardStatusPage(worker: Worker): Promise<Page> {
  const page = worker.pages.get("ag_status");
  if (!page) {
    throw new Error("Scratch-card status worker page is unavailable");
  }

  const currentUrl = page.url().toLowerCase();
  if (currentUrl.includes("/account/login")) {
    await loginToAG();
  }

  await openAGPolicyStatusPage(page);
  touchSession("ag_status");
  return page;
}

async function finalizeTask(task: PolicyStatusTask) {
  const workerId = taskWorkers.get(task.id);
  if (workerId) {
    await releaseWorker(workerId);
    taskWorkers.delete(task.id);
  }

  activePolicyStatusTasks.delete(task.id);
  policyStatusHistory.unshift(task);
  saveTaskLog(task.id, task);
}

async function executePolicyStatusTask(task: PolicyStatusTask): Promise<void> {
  let worker: Worker | undefined;

  try {
    const lookupType =
      task.input.lookupType || detectPolicyStatusLookupType(task.input.lookupValue);
    const channel =
      task.result?.channel || detectPolicyStatusChannel(task.input.lookupValue, lookupType);
    const workerSites = channel === "scratch_card" ? ["ag_status"] as const : ["epin"] as const;
    touchWorkActivity(channel === "scratch_card" ? "ag_status" : "epin");
    worker = await acquireWorker([...workerSites]);
    taskWorkers.set(task.id, worker.id);
    addStep(task, createStep(`Worker ${worker.id} assigned`, "success"));

    const page =
      channel === "scratch_card"
        ? await prepareWorkerCardStatusPage(worker)
        : await prepareWorkerEPINStatusPage(worker);
    addStep(
      task,
      createStep(
        channel === "scratch_card"
          ? "Scratch-card status page ready"
          : "E-PIN status page ready",
        "success",
      ),
    );

    if (channel === "scratch_card") {
      const scratchLookupType =
        lookupType === "certificate" ? "certificate" : "policy_number";
      await searchAGPolicyStatus(page, task.input.lookupValue, scratchLookupType);
      addStep(
        task,
        createStep(
          `Search scratch-card status by ${scratchLookupType}: ${task.input.lookupValue}`,
          "success",
        ),
      );
      task.result = await extractAGPolicyStatusSummary(
        page,
        task.input.lookupValue,
        scratchLookupType,
      );
    } else {
      await searchEPINPolicyStatus(
        page,
        task.input.lookupValue,
        lookupType === "certificate" ? "policy_number" : lookupType,
      );
      addStep(
        task,
        createStep(
          `Search policy status by ${lookupType}: ${task.input.lookupValue}`,
          "success",
        ),
      );

      task.result = await extractEPINPolicyStatus(
        page,
        task.input.lookupValue,
        lookupType === "certificate" ? "policy_number" : lookupType,
      );
    }
    addStep(
      task,
      createStep(
        "Policy status extracted",
        "success",
        `${task.result.summaryRows.length} summary row(s), ${task.result.trailRows.length} trail row(s)`,
      ),
    );

    task.status = "awaiting_user_action";
    saveTaskLog(task.id, task);
    emitEvent("polstatus:awaiting_action", {
      taskId: task.id,
      lookupValue: task.input.lookupValue,
      lookupType,
      result: task.result,
    });
  } catch (err: any) {
    task.status = "failed";
    task.error = err.message;
    task.completedAt = new Date().toISOString();
    addStep(task, createStep("Policy status failed", "failed", err.message));
    emitEvent("polstatus:failed", { taskId: task.id, error: task.error });
    await finalizeTask(task);
  }
}

export function startPolicyStatus(input: PolicyStatusInput): PolicyStatusTask {
  const normalizedInput: PolicyStatusInput = {
    lookupValue: input.lookupValue.trim(),
    lookupType:
      input.lookupType || detectPolicyStatusLookupType(input.lookupValue),
  };

  const task: PolicyStatusTask = {
    id: uuid(),
    input: normalizedInput,
    status: "running",
    steps: [],
    createdAt: new Date().toISOString(),
  };

  activePolicyStatusTasks.set(task.id, task);
  emitEvent("polstatus:started", {
    taskId: task.id,
    lookupValue: normalizedInput.lookupValue,
    lookupType: normalizedInput.lookupType,
  });
  log(
    `Starting policy status task: ${task.id} (${normalizedInput.lookupType}: ${normalizedInput.lookupValue})`,
  );

  void executePolicyStatusTask(task);
  return task;
}

export async function closePolicyStatus(taskId: string): Promise<boolean> {
  const task = activePolicyStatusTasks.get(taskId);
  if (!task) return false;

  task.status = "completed";
  task.completedAt = new Date().toISOString();
  addStep(task, createStep("Policy status view closed", "success"));
  emitEvent("polstatus:completed", {
    taskId: task.id,
    lookupValue: task.input.lookupValue,
    lookupType: task.input.lookupType,
    result: task.result,
  });

  await finalizeTask(task);
  return true;
}

export async function resetPolicyStatus(taskId: string): Promise<boolean> {
  const task = activePolicyStatusTasks.get(taskId);
  if (!task) return false;
  if (task.status !== "awaiting_user_action") {
    throw new Error("Policy status task is not awaiting user action");
  }
  if (task.result?.channel === "scratch_card") {
    throw new Error("Scratch-card policy status uses Track Details, not Reset Push");
  }

  const workerId = taskWorkers.get(task.id);
  if (!workerId) {
    throw new Error("Policy status worker is no longer available");
  }

  const worker = getWorkerById(workerId);
  if (!worker) {
    throw new Error("Policy status worker is no longer available");
  }

  try {
    const lookupType =
      task.input.lookupType || detectPolicyStatusLookupType(task.input.lookupValue);
    const epinLookupType =
      lookupType === "registration" ? "registration" : "policy_number";
    task.status = "running";
    touchWorkActivity("epin");
    addStep(task, createStep("Reset requested by user", "success"));

    const page = await prepareWorkerEPINStatusPage(worker);
    await searchEPINPolicyStatus(
      page,
      task.input.lookupValue,
      epinLookupType,
    );
    addStep(
      task,
      createStep(
        `Search policy status by ${lookupType}: ${task.input.lookupValue}`,
        "success",
      ),
    );

    await resetEPINPolicyStatusPush(page, task.input.lookupValue);
    addStep(
      task,
      createStep(`Reset push clicked for ${task.input.lookupValue}`, "success"),
    );

    await searchEPINPolicyStatus(
      page,
      task.input.lookupValue,
      epinLookupType,
    );
    task.result = await extractEPINPolicyStatus(
      page,
      task.input.lookupValue,
      epinLookupType,
    );
    addStep(
      task,
      createStep(
        "Policy status re-extracted after reset",
        "success",
        `${task.result.summaryRows.length} summary row(s), ${task.result.trailRows.length} trail row(s)`,
      ),
    );

    task.status = "completed";
    task.completedAt = new Date().toISOString();
    emitEvent("polstatus:completed", {
      taskId: task.id,
      lookupValue: task.input.lookupValue,
      lookupType,
      result: task.result,
    });

    await finalizeTask(task);
    return true;
  } catch (err: any) {
    task.status = "failed";
    task.error = err.message;
    task.completedAt = new Date().toISOString();
    addStep(task, createStep("Policy status reset failed", "failed", err.message));
    emitEvent("polstatus:failed", { taskId: task.id, error: task.error });
    await finalizeTask(task);
    throw err;
  }
}

export async function trackPolicyStatus(taskId: string): Promise<boolean> {
  const task = activePolicyStatusTasks.get(taskId);
  if (!task) return false;
  if (task.status !== "awaiting_user_action") {
    throw new Error("Policy status task is not awaiting user action");
  }
  if (
    task.result?.channel !== "scratch_card" &&
    task.result?.channel !== "epin"
  ) {
    throw new Error(
      "Track Details is only available for supported policy status results",
    );
  }

  const workerId = taskWorkers.get(task.id);
  if (!workerId) {
    throw new Error("Policy status worker is no longer available");
  }

  const worker = getWorkerById(workerId);
  if (!worker) {
    throw new Error("Policy status worker is no longer available");
  }

  try {
    addStep(task, createStep("Track details requested by user", "success"));
    const lookupType =
      task.input.lookupType || detectPolicyStatusLookupType(task.input.lookupValue);
    if (task.result?.channel === "scratch_card") {
      touchWorkActivity("ag_status");
      const page = await prepareWorkerCardStatusPage(worker);
      const scratchLookupType =
        lookupType === "certificate" ? "certificate" : "policy_number";

      await searchAGPolicyStatus(page, task.input.lookupValue, scratchLookupType);
      addStep(
        task,
        createStep(
          `Search scratch-card status by ${scratchLookupType}: ${task.input.lookupValue}`,
          "success",
        ),
      );

      await trackAGPolicyStatusDetails(page, task.input.lookupValue);
      addStep(task, createStep("Track details opened", "success"));

      const detailRows = await extractAGPolicyStatusDetails(page);
      task.result = {
        ...(task.result || {
          lookupValue: task.input.lookupValue,
          lookupType: scratchLookupType,
          channel: "scratch_card",
          summaryRows: [],
          trailRows: [],
        }),
        detailRows,
      };
      addStep(task, createStep("Scratch-card details extracted", "success"));

      saveTaskLog(task.id, task);
      emitEvent("polstatus:awaiting_action", {
        taskId: task.id,
        lookupValue: task.input.lookupValue,
        lookupType: scratchLookupType,
        result: task.result,
      });
      return true;
    }

    touchWorkActivity("epin");
    const page = await prepareWorkerEPINStatusPage(worker);
    const epinLookupType =
      lookupType === "registration" ? "registration" : "policy_number";

    await searchEPINPolicyStatus(page, task.input.lookupValue, epinLookupType);
    addStep(
      task,
      createStep(
        `Search policy status by ${lookupType}: ${task.input.lookupValue}`,
        "success",
      ),
    );

    await trackEPINPolicyStatusDetails(page, task.input.lookupValue);
    addStep(task, createStep("Track details opened", "success"));

    const { detailRows, trailRows } = await extractEPINPolicyStatusDetails(page);
    task.result = {
      ...(task.result || {
        lookupValue: task.input.lookupValue,
        lookupType: epinLookupType,
        channel: "epin",
        summaryRows: [],
        trailRows: [],
      }),
      detailRows,
      trailRows: trailRows.length > 0 ? trailRows : task.result?.trailRows || [],
    };
    addStep(task, createStep("E-PIN details extracted", "success"));

    saveTaskLog(task.id, task);
    emitEvent("polstatus:awaiting_action", {
      taskId: task.id,
      lookupValue: task.input.lookupValue,
      lookupType: epinLookupType,
      result: task.result,
    });
    return true;
  } catch (err: any) {
    task.status = "failed";
    task.error = err.message;
    task.completedAt = new Date().toISOString();
    addStep(task, createStep("Track details failed", "failed", err.message));
    emitEvent("polstatus:failed", { taskId: task.id, error: task.error });
    await finalizeTask(task);
    throw err;
  }
}

export function getPolicyStatusHistory(): PolicyStatusTask[] {
  return [...policyStatusHistory, ...Array.from(activePolicyStatusTasks.values())].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}
