import { v4 as uuid } from "uuid";
import { Page } from "playwright";
import {
  PolicyStatusInput,
  PolicyStatusTask,
  TaskStep,
  Worker,
} from "../types";
import { acquireWorker, getWorkerById, releaseWorker } from "../browser/workerPool";
import { config } from "../config";
import {
  extractEPINPolicyStatus,
  openEPINPolicyStatusPage,
  resetEPINPolicyStatusPush,
  searchEPINPolicyStatus,
} from "../browser/actions/epin";
import { emitEvent, log, saveTaskLog } from "../utils/logger";
import { touchSession, touchWorkActivity } from "../browser/controller";

const activePolicyStatusTasks: Map<string, PolicyStatusTask> = new Map();
const policyStatusHistory: PolicyStatusTask[] = [];
const taskWorkers: Map<string, string> = new Map();

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
    touchWorkActivity("epin");
    worker = await acquireWorker(["epin"]);
    taskWorkers.set(task.id, worker.id);
    addStep(task, createStep(`Worker ${worker.id} assigned`, "success"));

    const page = await prepareWorkerEPINStatusPage(worker);
    addStep(task, createStep("E-PIN status page ready", "success"));

    await searchEPINPolicyStatus(page, task.input.policyNumber);
    addStep(task, createStep(`Search policy status: ${task.input.policyNumber}`, "success"));

    task.result = await extractEPINPolicyStatus(page, task.input.policyNumber);
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
      policyNumber: task.input.policyNumber,
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
  const task: PolicyStatusTask = {
    id: uuid(),
    input,
    status: "running",
    steps: [],
    createdAt: new Date().toISOString(),
  };

  activePolicyStatusTasks.set(task.id, task);
  emitEvent("polstatus:started", {
    taskId: task.id,
    policyNumber: input.policyNumber,
  });
  log(`Starting policy status task: ${task.id} (${input.policyNumber})`);

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
    policyNumber: task.input.policyNumber,
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

  const workerId = taskWorkers.get(task.id);
  if (!workerId) {
    throw new Error("Policy status worker is no longer available");
  }

  const worker = getWorkerById(workerId);
  if (!worker) {
    throw new Error("Policy status worker is no longer available");
  }

  try {
    task.status = "running";
    touchWorkActivity("epin");
    addStep(task, createStep("Reset requested by user", "success"));

    const page = await prepareWorkerEPINStatusPage(worker);
    await searchEPINPolicyStatus(page, task.input.policyNumber);
    addStep(task, createStep(`Search policy status: ${task.input.policyNumber}`, "success"));

    await resetEPINPolicyStatusPush(page, task.input.policyNumber);
    addStep(task, createStep(`Reset push clicked for ${task.input.policyNumber}`, "success"));

    await searchEPINPolicyStatus(page, task.input.policyNumber);
    task.result = await extractEPINPolicyStatus(page, task.input.policyNumber);
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
      policyNumber: task.input.policyNumber,
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

export function getPolicyStatusHistory(): PolicyStatusTask[] {
  return [...policyStatusHistory, ...Array.from(activePolicyStatusTasks.values())].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}
