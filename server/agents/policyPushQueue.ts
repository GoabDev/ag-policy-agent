import { PolicyPushInput, PolicyPushTask } from "../types";
import {
  PolicyPushRunMetadata,
  PolicyPushSessionSites,
  runPolicyPush,
} from "./policyPushRunner";

type QueuePriority = "manual" | "automated";
type QueueSessionScope = "manual" | "automated";

interface QueueJob {
  id: string;
  input: PolicyPushInput;
  priority: QueuePriority;
  sessionScope: QueueSessionScope;
  metadata: PolicyPushRunMetadata;
  resolve: (task: PolicyPushTask) => void;
  reject: (err: Error) => void;
}

const queue: QueueJob[] = [];
let activeJob: QueueJob | null = null;
let sequence = 0;

function nextId(): string {
  sequence += 1;
  return `push-job-${Date.now()}-${sequence}`;
}

function sortQueue() {
  queue.sort((a, b) => {
    if (a.priority === b.priority) return 0;
    return a.priority === "manual" ? -1 : 1;
  });
}

async function drainQueue() {
  if (activeJob) return;

  sortQueue();
  const job = queue.shift();
  if (!job) return;

  activeJob = job;
  try {
    const sites: PolicyPushSessionSites =
      job.sessionScope === "automated"
        ? { ag: "ag_auto_push", niid: "niid_auto_push" }
        : { ag: "ag_push", niid: "niid_push" };
    const task = await runPolicyPush(job.input, sites, job.metadata);
    job.resolve(task);
  } catch (err: any) {
    job.reject(err);
  } finally {
    activeJob = null;
    void drainQueue();
  }
}

export function enqueuePolicyPush(
  input: PolicyPushInput,
  priority: QueuePriority = "manual",
  sessionScope: QueueSessionScope = priority === "automated" ? "automated" : "manual",
  metadata: PolicyPushRunMetadata = {},
): Promise<PolicyPushTask> {
  return new Promise((resolve, reject) => {
    queue.push({
      id: nextId(),
      input,
      priority,
      sessionScope,
      metadata,
      resolve,
      reject,
    });
    void drainQueue();
  });
}

export function isPolicyPushLaneBusy(): boolean {
  return Boolean(activeJob);
}

export function hasWaitingManualPolicyPush(): boolean {
  return queue.some((job) => job.priority === "manual");
}

export function getPolicyPushQueueStatus() {
  return {
    isBusy: Boolean(activeJob),
    activeJob: activeJob
      ? {
          id: activeJob.id,
          priority: activeJob.priority,
          sessionScope: activeJob.sessionScope,
          metadata: activeJob.metadata,
          input: activeJob.input,
        }
      : null,
    waiting: queue.map((job) => ({
      id: job.id,
      priority: job.priority,
      sessionScope: job.sessionScope,
      metadata: job.metadata,
      input: job.input,
    })),
  };
}
