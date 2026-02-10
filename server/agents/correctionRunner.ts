import { v4 as uuid } from 'uuid';
import { Page } from 'playwright';
import {
  CorrectionInput,
  Task,
  TaskStep,
  NameCorrectionInput,
  RegistrationCorrectionInput,
  VehicleMakeCorrectionInput,
  Worker,
  SiteName,
} from '../types';
import { log, emitEvent, saveTaskLog } from '../utils/logger';
import { searchPolicy, correctName, correctRegistration, correctVehicleMake, loginToAG, navigateToPolicy, AG_SELECTORS } from '../browser/actions/ag';
import { searchNIIDPolicy, correctNIIDRegistration } from '../browser/actions/niid';
import { acquireWorker, releaseWorker } from '../browser/workerPool';
import { touchSession } from '../browser/controller';
import { config } from '../config';

// Running tasks (supports multiple concurrent tasks)
const runningTasks: Map<string, Task> = new Map();
const taskHistory: Task[] = [];

// ============================================
// Task Helpers
// ============================================

function addStep(task: Task, step: TaskStep) {
  task.steps.push(step);
  emitEvent('task:step', { taskId: task.id, step });
}

function createStep(
  site: 'ag' | 'niid',
  action: string,
  status: 'success' | 'failed' | 'skipped',
  details?: string
): TaskStep {
  return {
    timestamp: new Date().toISOString(),
    site,
    action,
    status,
    details,
  };
}

// ============================================
// Worker Page Helpers (equivalent to getAGPolicyPage/getNIIDPolicyPage but for workers)
// ============================================

async function prepareWorkerAGPage(worker: Worker): Promise<Page> {
  const page = worker.pages.get('ag')!;
  const currentUrl = page.url();

  if (currentUrl.includes('ErrorPage.aspx')) {
    log(`Worker ${worker.id}: A&G session expired, re-logging in...`, 'warn');
    await page.goto(config.ag.url, { waitUntil: 'networkidle' });
    await page.fill('internal:role=textbox[name="Username"i]', config.ag.username);
    await page.fill('internal:role=textbox[name="Password"i]', config.ag.password);
    await page.click('internal:role=button[name="Logon"i]');
    await page.waitForSelector('internal:text="Dashboard"', { timeout: 30000 });
    // Navigate to Update Policy
    await page.click('internal:role=link[name=" Policy Operations "i]');
    await page.click('internal:role=link[name="Update Policy"i]');
    return page;
  }

  if (currentUrl.includes('Policy_Update.aspx')) {
    touchSession('ag');
    return page;
  }

  // Fallback: full login + navigate
  log(`Worker ${worker.id}: A&G not on Update Policy page, logging in...`);
  await page.goto(config.ag.url, { waitUntil: 'networkidle' });

  // Check if already logged in
  try {
    await page.waitForSelector('internal:text="Dashboard"', { timeout: 5000 });
  } catch {
    await page.fill('internal:role=textbox[name="Username"i]', config.ag.username);
    await page.fill('internal:role=textbox[name="Password"i]', config.ag.password);
    await page.click('internal:role=button[name="Logon"i]');
    await page.waitForSelector('internal:text="Dashboard"', { timeout: 30000 });
  }

  await page.click('internal:role=link[name=" Policy Operations "i]');
  await page.click('internal:role=link[name="Update Policy"i]');
  return page;
}

async function prepareWorkerNIIDPage(worker: Worker): Promise<Page> {
  const page = worker.pages.get('niid')!;
  const currentUrl = page.url();

  if (currentUrl.includes('/default.aspx')) {
    throw new Error('NIID session has expired. Please login to NIID manually and retry.');
  }

  if (currentUrl.includes('Change_Request.aspx')) {
    touchSession('niid');
    return page;
  }

  // Navigate to park page
  await page.goto(config.niid.policyCorrectionUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });

  const landedUrl = page.url();
  if (landedUrl.includes('/default.aspx')) {
    throw new Error('NIID session has expired. Please login to NIID manually and retry.');
  }

  touchSession('niid');
  return page;
}

// ============================================
// Run Correction (parallel-safe)
// ============================================

export async function runCorrection(input: CorrectionInput): Promise<Task> {
  const task: Task = {
    id: uuid(),
    correction: input,
    status: 'running',
    steps: [],
    createdAt: new Date().toISOString(),
  };

  runningTasks.set(task.id, task);
  emitEvent('task:started', { taskId: task.id, type: input.type, policyNumber: input.policyNumber });
  log(`Starting correction task: ${task.id} (${input.type}) — policy: ${input.policyNumber}`);

  // Determine which sites this correction needs
  const sites: SiteName[] = input.type === 'registration' ? ['ag', 'niid'] : ['ag'];

  // Acquire a worker from the pool
  let worker: Worker;
  try {
    worker = await acquireWorker(sites);
    addStep(task, createStep('ag', `Worker ${worker.id} assigned`, 'success'));
  } catch (err: any) {
    task.status = 'failed';
    task.error = `Failed to acquire worker: ${err.message}`;
    task.completedAt = new Date().toISOString();
    addStep(task, createStep('ag', 'Failed to acquire worker', 'failed', err.message));
    emitEvent('task:failed', { taskId: task.id, error: task.error });
    runningTasks.delete(task.id);
    taskHistory.unshift(task);
    saveTaskLog(task.id, task);
    return task;
  }

  try {
    switch (input.type) {
      case 'name':
        await runNameCorrection(task, input, worker);
        break;
      case 'registration':
        await runRegistrationCorrection(task, input, worker);
        break;
      case 'vehicle_make':
        await runVehicleMakeCorrection(task, input, worker);
        break;
      default:
        throw new Error(`Unknown correction type: ${(input as any).type}`);
    }

    task.status = 'completed';
    task.completedAt = new Date().toISOString();
    emitEvent('task:completed', { taskId: task.id });
    log(`Task completed: ${task.id}`);
  } catch (err: any) {
    task.status = 'failed';
    task.error = err.message;
    task.completedAt = new Date().toISOString();
    addStep(task, createStep('ag', 'error', 'failed', err.message));
    emitEvent('task:failed', { taskId: task.id, error: err.message });
    log(`Task failed: ${task.id} — ${err.message}`, 'error');
  } finally {
    // Always release the worker
    await releaseWorker(worker.id);
  }

  // Save to history
  runningTasks.delete(task.id);
  taskHistory.unshift(task);
  saveTaskLog(task.id, task);

  return task;
}

// ============================================
// Name Correction (A&G only)
// ============================================

async function runNameCorrection(task: Task, input: NameCorrectionInput, worker: Worker) {
  const page = await prepareWorkerAGPage(worker);
  addStep(task, createStep('ag', 'A&G session ready', 'success'));

  await searchPolicy(page, input.policyNumber);
  addStep(task, createStep('ag', `Search policy: ${input.policyNumber}`, 'success'));

  await correctName(page, input.firstName, input.lastName);
  addStep(task, createStep('ag', `Name updated to: ${input.firstName} ${input.lastName}`, 'success'));

  addStep(task, createStep('niid', 'NIID update not required for name correction', 'skipped'));
}

// ============================================
// Registration Correction (Both sites)
// ============================================

async function runRegistrationCorrection(task: Task, input: RegistrationCorrectionInput, worker: Worker) {
  const agPage = await prepareWorkerAGPage(worker);
  addStep(task, createStep('ag', 'A&G session ready', 'success'));

  await searchPolicy(agPage, input.policyNumber);
  addStep(task, createStep('ag', `Search policy: ${input.policyNumber}`, 'success'));

  const oldRegNumber = await correctRegistration(agPage, input.newRegistrationNumber);
  addStep(task, createStep('ag', `Registration updated (old: ${oldRegNumber} → new: ${input.newRegistrationNumber})`, 'success'));

  const niidPage = await prepareWorkerNIIDPage(worker);
  addStep(task, createStep('niid', 'NIID session ready', 'success'));

  await searchNIIDPolicy(niidPage, input.policyNumber, oldRegNumber);
  addStep(task, createStep('niid', `NIID search: policy ${input.policyNumber} + reg ${oldRegNumber}`, 'success'));

  await correctNIIDRegistration(niidPage, input.newRegistrationNumber);
  addStep(task, createStep('niid', `NIID registration updated to: ${input.newRegistrationNumber}`, 'success'));
}

// ============================================
// Vehicle Make Correction (A&G only)
// ============================================

async function runVehicleMakeCorrection(task: Task, input: VehicleMakeCorrectionInput, worker: Worker) {
  const page = await prepareWorkerAGPage(worker);
  addStep(task, createStep('ag', 'A&G session ready', 'success'));

  await searchPolicy(page, input.policyNumber);
  addStep(task, createStep('ag', `Search policy: ${input.policyNumber}`, 'success'));

  await correctVehicleMake(page, input.newVehicleMake, input.newVehicleModel);
  addStep(task, createStep('ag', `Vehicle updated to: ${input.newVehicleMake} ${input.newVehicleModel}`, 'success'));

  addStep(task, createStep('niid', 'NIID update not required for vehicle make correction', 'skipped'));
}

// ============================================
// Getters
// ============================================

export function getRunningTasks(): Task[] {
  return Array.from(runningTasks.values());
}

export function getTaskHistory(): Task[] {
  return taskHistory;
}
