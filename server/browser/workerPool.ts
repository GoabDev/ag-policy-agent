import { v4 as uuid } from "uuid";
import { BrowserContext, Page } from "playwright";
import { config } from "../config";
import { createWorkerContext } from "./controller";
import { log } from "../utils/logger";
import { SiteName, Worker, WorkerPoolStatus } from "../types";
import { getNetworkTimeoutMs } from "./timeoutSettings";

const PARK_PAGES: Record<SiteName, string> = {
  ag: process.env.AG_POLICY_UPDATE_URL || "",
  ag_status: config.ag.policyStatusUrl,
  epin: config.epin.parkUrl,
  ag_push: config.ag.spoolUrl,
  ag_auto_push: config.ag.spoolUrl,
  niid: config.niid.policyCorrectionUrl,
  niip: config.niip.parkUrl,
  niid_push: config.niidPush.uploadUrl,
  niid_auto_push: config.niidPush.uploadUrl,
};

type WaitQueueEntry = {
  sites: SiteName[];
  resolve: (worker: Worker) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
  cleanup: () => void;
};

const workers: Map<string, Worker> = new Map();
const waitQueue: WaitQueueEntry[] = [];
let processingQueue = false;

const BACKGROUND_PRELOAD_SITES = new Set<SiteName>([
  "niid",
  "niip",
  "niid_push",
  "niid_auto_push",
]);

async function createWorker(sites: SiteName[]): Promise<Worker> {
  const id = uuid().slice(0, 8);
  const contexts = new Map<SiteName, BrowserContext>();
  const pages = new Map<SiteName, Page>();
  const preloads = new Map<SiteName, Promise<void>>();

  for (const site of sites) {
    const { context, page } = await createWorkerContext(site);
    contexts.set(site, context);
    pages.set(site, page);

    if (BACKGROUND_PRELOAD_SITES.has(site)) {
      preloads.set(site, preloadWorkerPage(id, site, page));
    }
  }

  const worker: Worker = { id, contexts, pages, preloads, busy: true };
  workers.set(id, worker);
  log(`Worker ${id} created (sites: ${sites.join(", ")})`);
  return worker;
}

function preloadWorkerPage(workerId: string, site: SiteName, page: Page): Promise<void> {
  return page
    .goto(PARK_PAGES[site], {
      waitUntil: "domcontentloaded",
      timeout: getNetworkTimeoutMs(),
    })
    .then(() => {
      log(`Worker ${workerId}: ${site} preloaded`);
    })
    .catch((err: any) => {
      log(`Worker ${workerId}: ${site} preload failed: ${err.message}`, "warn");
    });
}

export async function awaitWorkerPreload(worker: Worker, site: SiteName) {
  const preload = worker.preloads?.get(site);
  if (!preload) return;

  await preload;
  worker.preloads?.delete(site);
}

export async function acquireWorker(
  sites: SiteName[],
  options: { signal?: AbortSignal } = {},
): Promise<Worker> {
  if (options.signal?.aborted) {
    throw new Error("Worker request was cancelled");
  }

  const availableWorker = await findAvailableWorker(sites);
  if (availableWorker) {
    availableWorker.busy = true;
    log(`Worker ${availableWorker.id} acquired (reused)`);
    return availableWorker;
  }

  if (workers.size < config.maxWorkers) {
    return createWorker(sites);
  }

  log(`All ${config.maxWorkers} workers busy, queuing request...`);
  return new Promise<Worker>((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      if (options.signal) {
        options.signal.removeEventListener("abort", onAbort);
      }
    };

    const removeFromQueue = () => {
      const index = waitQueue.findIndex((entry) => entry.resolve === resolve);
      if (index >= 0) waitQueue.splice(index, 1);
    };

    const onAbort = () => {
      removeFromQueue();
      cleanup();
      reject(new Error("Worker request was cancelled"));
    };

    const timer = setTimeout(() => {
      removeFromQueue();
      cleanup();
      const message = `Timed out waiting for an available worker (${sites.join(", ")})`;
      log(message, "warn");
      reject(new Error(message));
    }, getNetworkTimeoutMs());

    if (options.signal) {
      options.signal.addEventListener("abort", onAbort, { once: true });
    }

    waitQueue.push({ sites, resolve, reject, timer, cleanup });
    void processWaitQueue();
  });
}

export async function releaseWorker(
  workerId: string,
  options: { destroy?: boolean } = {},
) {
  const worker = workers.get(workerId);
  if (!worker) return;

  if (options.destroy) {
    await destroyWorker(workerId);
    void processWaitQueue();
    return;
  }

  worker.busy = false;
  log(`Worker ${workerId} released`);

  const assignedQueuedTask = await processWaitQueue();
  if (assignedQueuedTask) return;

  for (const [site, page] of worker.pages) {
    if (!page.isClosed()) {
      try {
        await page.goto(PARK_PAGES[site], {
          waitUntil: "domcontentloaded",
          timeout: getNetworkTimeoutMs(),
        });
      } catch {
        // Page health is checked before reuse.
      }
    }
  }
}

async function processWaitQueue(): Promise<boolean> {
  if (processingQueue || waitQueue.length === 0) return false;
  processingQueue = true;

  try {
    for (let index = 0; index < waitQueue.length; index += 1) {
      const next = waitQueue[index];
      const worker = await findAvailableWorker(next.sites);

      if (worker) {
        waitQueue.splice(index, 1);
        next.cleanup();
        worker.busy = true;
        log(`Worker ${worker.id} assigned from queue`);
        next.resolve(worker);
        return true;
      }

      if (workers.size < config.maxWorkers) {
        waitQueue.splice(index, 1);
        next.cleanup();
        const created = await createWorker(next.sites);
        log(`Worker ${created.id} created for queued request`);
        next.resolve(created);
        return true;
      }
    }
  } finally {
    processingQueue = false;
  }

  return false;
}

async function findAvailableWorker(sites: SiteName[]): Promise<Worker | null> {
  for (const [, worker] of workers) {
    if (worker.busy || !sites.every((site) => worker.pages.has(site))) {
      continue;
    }

    const healthy = sites.every((site) => {
      const page = worker.pages.get(site);
      return page && !page.isClosed();
    });

    if (healthy) return worker;
    await destroyWorker(worker.id);
  }

  return null;
}

async function destroyWorker(workerId: string) {
  const worker = workers.get(workerId);
  if (!worker) return;

  for (const [, context] of worker.contexts) {
    try {
      await context.close();
    } catch {}
  }

  workers.delete(workerId);
  log(`Worker ${workerId} destroyed`);
}

export function getPoolStatus(): WorkerPoolStatus {
  const all = Array.from(workers.values());
  const busy = all.filter((worker) => worker.busy).length;
  return {
    total: all.length,
    busy,
    available: all.length - busy,
    maxWorkers: config.maxWorkers,
    queueLength: waitQueue.length,
  };
}

export function getWorkerById(workerId: string): Worker | undefined {
  return workers.get(workerId);
}

export async function destroyAllWorkers() {
  for (const [id] of workers) {
    await destroyWorker(id);
  }

  for (const entry of waitQueue.splice(0)) {
    entry.cleanup();
    entry.reject(new Error("Worker pool was reset before a worker was assigned"));
  }

  log("All workers destroyed");
}

export async function destroyWorkersForSites(sites: SiteName[]) {
  const siteSet = new Set(sites);
  for (const [id, worker] of Array.from(workers.entries())) {
    const usesSite = Array.from(worker.pages.keys()).some((site) =>
      siteSet.has(site),
    );
    if (usesSite) {
      await destroyWorker(id);
    }
  }

  void processWaitQueue();
  log(`Destroyed workers for refreshed sessions: ${sites.join(", ")}`);
}
