import { v4 as uuid } from 'uuid';
import { BrowserContext, Page } from 'playwright';
import { config } from '../config';
import { createWorkerContext } from './controller';
import { log } from '../utils/logger';
import { SiteName, Worker, WorkerPoolStatus } from '../types';

// Park pages — where workers navigate after release
const PARK_PAGES: Record<SiteName, string> = {
  ag: 'https://aginsuranceapplications.com/card/Policy/Policy_Update.aspx',
  niid: 'https://niid.org/App_ADM_Module/Change_Request.aspx',
  niid_push: 'https://niid.org/App_POL_Module/Upload_Policy.aspx',
};

// Pool state
const workers: Map<string, Worker> = new Map();
const waitQueue: Array<{ sites: SiteName[]; resolve: (worker: Worker) => void }> = [];

// ============================================
// Create a new worker with contexts for the requested sites
// ============================================

async function createWorker(sites: SiteName[]): Promise<Worker> {
  const id = uuid().slice(0, 8);
  const contexts = new Map<SiteName, BrowserContext>();
  const pages = new Map<SiteName, Page>();

  for (const site of sites) {
    const { context, page } = await createWorkerContext(site);
    contexts.set(site, context);
    pages.set(site, page);

    // Navigate to park page so it's ready
    try {
      await page.goto(PARK_PAGES[site], { waitUntil: 'domcontentloaded', timeout: 30000 });
    } catch (err: any) {
      log(`Worker ${id}: failed to navigate to ${site} park page: ${err.message}`, 'warn');
    }
  }

  const worker: Worker = { id, contexts, pages, busy: true };
  workers.set(id, worker);
  log(`Worker ${id} created (sites: ${sites.join(', ')})`);
  return worker;
}

// ============================================
// Acquire a worker — returns an available one or creates new (up to max)
// ============================================

export async function acquireWorker(sites: SiteName[]): Promise<Worker> {
  // Try to find an idle worker that has all needed sites
  for (const [, worker] of workers) {
    if (!worker.busy && sites.every(s => worker.pages.has(s))) {
      // Verify pages are still alive
      let healthy = true;
      for (const site of sites) {
        const page = worker.pages.get(site)!;
        if (page.isClosed()) {
          healthy = false;
          break;
        }
      }

      if (healthy) {
        worker.busy = true;
        log(`Worker ${worker.id} acquired (reused)`);
        return worker;
      } else {
        // Remove broken worker
        await destroyWorker(worker.id);
      }
    }
  }

  // No available worker — create one if under limit
  const busyCount = Array.from(workers.values()).filter(w => w.busy).length;
  if (workers.size < config.maxWorkers) {
    return createWorker(sites);
  }

  // At max capacity — wait in queue
  log(`All ${config.maxWorkers} workers busy, queuing request...`);
  return new Promise<Worker>((resolve) => {
    waitQueue.push({ sites, resolve });
  });
}

// ============================================
// Release a worker back to the pool
// ============================================

export async function releaseWorker(workerId: string) {
  const worker = workers.get(workerId);
  if (!worker) return;

  worker.busy = false;
  log(`Worker ${workerId} released`);

  // Check if someone is waiting in the queue
  if (waitQueue.length > 0) {
    const next = waitQueue.shift()!;

    // Check if this worker has the needed sites
    if (next.sites.every(s => worker.pages.has(s))) {
      worker.busy = true;
      log(`Worker ${workerId} immediately reassigned from queue`);
      next.resolve(worker);
      return;
    }

    // Worker doesn't have the right sites — put the request back and try others
    waitQueue.unshift(next);
  }

  // Navigate worker pages back to park pages for reuse
  for (const [site, page] of worker.pages) {
    if (!page.isClosed()) {
      try {
        await page.goto(PARK_PAGES[site], { waitUntil: 'domcontentloaded', timeout: 15000 });
      } catch {
        // Page may have issues, will be replaced on next acquire
      }
    }
  }
}

// ============================================
// Destroy a worker (cleanup)
// ============================================

async function destroyWorker(workerId: string) {
  const worker = workers.get(workerId);
  if (!worker) return;

  for (const [, ctx] of worker.contexts) {
    try { await ctx.close(); } catch {}
  }

  workers.delete(workerId);
  log(`Worker ${workerId} destroyed`);
}

// ============================================
// Get pool status
// ============================================

export function getPoolStatus(): WorkerPoolStatus {
  const all = Array.from(workers.values());
  const busy = all.filter(w => w.busy).length;
  return {
    total: all.length,
    busy,
    available: all.length - busy,
    maxWorkers: config.maxWorkers,
    queueLength: waitQueue.length,
  };
}

// ============================================
// Cleanup all workers (for shutdown)
// ============================================

export async function destroyAllWorkers() {
  for (const [id] of workers) {
    await destroyWorker(id);
  }
  waitQueue.length = 0;
  log('All workers destroyed');
}
