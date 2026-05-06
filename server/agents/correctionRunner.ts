import { v4 as uuid } from 'uuid';
import { Page } from 'playwright';
import {
  CorrectionInput,
  Task,
  TaskStep,
  NameCorrectionInput,
  RegistrationCorrectionInput,
  VehicleMakeCorrectionInput,
  RegAndChassisCorrectionInput,
  ChassisCorrectionInput,
  Worker,
  SiteName,
} from '../types';
import { log, emitEvent, saveTaskLog } from '../utils/logger';
import { searchPolicy, correctName, correctRegistration, correctRegandChasis, correctChassis, correctVehicleMake, loginToAG, navigateToPolicy, AG_SELECTORS } from '../browser/actions/ag';
import { searchNIIDPolicy, correctNIIDRegistration, correctNIIDRegAndChassis, correctNIIDChassis } from '../browser/actions/niid';
import { searchEPINPolicy, correctEPINName, correctEPINRegistration, correctEPINRegAndChassis, correctEPINChassis, correctEPINVehicleMake } from '../browser/actions/epin';
import { searchNIIPPolicy, correctNIIPName, correctNIIPRegistration, correctNIIPRegAndChassis, correctNIIPChassis } from '../browser/actions/niip';
import { acquireWorker, releaseWorker } from '../browser/workerPool';
import { touchSession, touchWorkActivity } from '../browser/controller';
import { config } from '../config';
import { getPolicyChannel } from '../utils/policyClassifier';

// Running tasks (supports multiple concurrent tasks)
const runningTasks: Map<string, Task> = new Map();
const abortControllers: Map<string, AbortController> = new Map();
const taskHistory: Task[] = [];

// ============================================
// Task Helpers
// ============================================

class CancellationError extends Error {
  constructor() {
    super('Task cancelled by user');
    this.name = 'CancellationError';
  }
}

function checkCancelled(signal: AbortSignal) {
  if (signal.aborted) throw new CancellationError();
}

function addStep(task: Task, step: TaskStep) {
  task.steps.push(step);
  emitEvent('task:step', { taskId: task.id, step });
}

function createStep(
  site: 'ag' | 'niid' | 'epin' | 'niip',
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

async function prepareWorkerEPINPage(worker: Worker): Promise<Page> {
  const page = worker.pages.get('epin')!;
  const currentUrl = page.url().toLowerCase();

  if (currentUrl.includes('/account/login')) {
    log(`Worker ${worker.id}: E-PIN session expired, re-logging in...`, 'warn');
    await page.goto(config.epin.url, { waitUntil: 'networkidle' });
    await page.fill('input[name="Username"]', config.epin.username);
    await page.fill('input[name="Password"]', config.epin.password);
    await page.click('button[type="submit"]');
    await page.goto(config.epin.parkUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
    return page;
  }

  if (currentUrl.includes('policyupdateniip.aspx')) {
    touchSession('epin');
    return page;
  }

  await page.goto(config.epin.parkUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
  touchSession('epin');
  return page;
}

async function prepareWorkerNIIPPage(worker: Worker): Promise<Page> {
  const page = worker.pages.get('niip')!;
  const currentUrl = page.url().toLowerCase();

  if (currentUrl.includes('/home/index')) {
    log(`Worker ${worker.id}: NIIP session expired, re-logging in...`, 'warn');
    await page.goto(config.niip.url, { waitUntil: 'networkidle' });
    await page.fill('input[name="Username"]', config.niip.username);
    await page.fill('input[name="Password"]', config.niip.password);
    await page.click('button[type="submit"]');
    await page.goto(config.niip.parkUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
    return page;
  }

  if (currentUrl.includes('/company/activepolicies')) {
    touchSession('niip');
    return page;
  }

  await page.goto(config.niip.parkUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
  touchSession('niip');
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

  const controller = new AbortController();
  const signal = controller.signal;

  runningTasks.set(task.id, task);
  abortControllers.set(task.id, controller);
  emitEvent('task:started', { taskId: task.id, type: input.type, policyNumber: input.policyNumber });
  log(`Starting correction task: ${task.id} (${input.type}) — policy: ${input.policyNumber}`);

  const policyChannel = getPolicyChannel(input.policyNumber);
  const primarySite = policyChannel === 'epin' ? 'epin' : 'ag';

  // Determine which sites this correction needs
  const sites: SiteName[] =
    policyChannel === 'epin'
      ? (input.type === 'name' || input.type === 'registration' || input.type === 'reg_and_chassis' || input.type === 'chassis')
        ? ['epin', 'niip']
        : ['epin']
      : (input.type === 'registration' || input.type === 'reg_and_chassis' || input.type === 'chassis')
        ? ['ag', 'niid']
        : ['ag'];

  // Reset inactivity timer — real work is happening
  for (const s of sites) touchWorkActivity(s);

  // Acquire a worker from the pool
  let worker: Worker;
  try {
    checkCancelled(signal);
    worker = await acquireWorker(sites);
    addStep(task, createStep(primarySite, `Worker ${worker.id} assigned`, 'success'));
  } catch (err: any) {
    if (err instanceof CancellationError) {
      task.status = 'cancelled';
      task.completedAt = new Date().toISOString();
      addStep(task, createStep(primarySite, 'Task cancelled by user', 'failed'));
      emitEvent('task:cancelled', { taskId: task.id });
      log(`Task cancelled: ${task.id}`);
    } else {
      task.status = 'failed';
      task.error = `Failed to acquire worker: ${err.message}`;
      task.completedAt = new Date().toISOString();
      addStep(task, createStep(primarySite, 'Failed to acquire worker', 'failed', err.message));
      emitEvent('task:failed', { taskId: task.id, error: task.error });
    }
    runningTasks.delete(task.id);
    abortControllers.delete(task.id);
    taskHistory.unshift(task);
    saveTaskLog(task.id, task);
    return task;
  }

  try {
    switch (input.type) {
      case 'name':
        await (policyChannel === 'epin'
          ? runEpinNameCorrection(task, input, worker, signal)
          : runNameCorrection(task, input, worker, signal));
        break;
      case 'registration':
        await (policyChannel === 'epin'
          ? runEpinRegistrationCorrection(task, input, worker, signal)
          : runRegistrationCorrection(task, input, worker, signal));
        break;
      case 'vehicle_make':
        await (policyChannel === 'epin'
          ? runEpinVehicleMakeCorrection(task, input, worker, signal)
          : runVehicleMakeCorrection(task, input, worker, signal));
        break;
      case 'reg_and_chassis':
        await (policyChannel === 'epin'
          ? runEpinRegAndChassisCorrection(task, input, worker, signal)
          : runRegAndChassisCorrection(task, input, worker, signal));
        break;
      case 'chassis':
        await (policyChannel === 'epin'
          ? runEpinChassisCorrection(task, input, worker, signal)
          : runChassisCorrection(task, input, worker, signal));
        break;
      default:
        throw new Error(`Unknown correction type: ${(input as any).type}`);
    }

    task.status = 'completed';
    task.completedAt = new Date().toISOString();
    emitEvent('task:completed', { taskId: task.id });
    log(`Task completed: ${task.id}`);
  } catch (err: any) {
    if (err instanceof CancellationError) {
      task.status = 'cancelled';
      task.completedAt = new Date().toISOString();
      addStep(task, createStep(primarySite, 'Task cancelled by user', 'failed'));
      emitEvent('task:cancelled', { taskId: task.id });
      log(`Task cancelled: ${task.id}`);
    } else {
      task.status = 'failed';
      task.error = err.message;
      task.completedAt = new Date().toISOString();
      addStep(task, createStep(primarySite, 'error', 'failed', err.message));
      emitEvent('task:failed', { taskId: task.id, error: err.message });
      log(`Task failed: ${task.id} — ${err.message}`, 'error');
    }
  } finally {
    // Always release the worker
    await releaseWorker(worker.id);
  }

  // Save to history
  runningTasks.delete(task.id);
  abortControllers.delete(task.id);
  taskHistory.unshift(task);
  saveTaskLog(task.id, task);

  return task;
}

// ============================================
// Name Correction (A&G only)
// ============================================

async function runNameCorrection(task: Task, input: NameCorrectionInput, worker: Worker, signal: AbortSignal) {
  const page = await prepareWorkerAGPage(worker);
  addStep(task, createStep('ag', 'A&G session ready', 'success'));
  checkCancelled(signal);

  await searchPolicy(page, input.policyNumber);
  addStep(task, createStep('ag', `Search policy: ${input.policyNumber}`, 'success'));
  checkCancelled(signal);

  const { oldFirstName, oldLastName } = await correctName(page, input.firstName, input.lastName);
  task.previousData = { firstName: oldFirstName, lastName: oldLastName };
  task.newData = { firstName: input.firstName, lastName: input.lastName };
  addStep(task, createStep('ag', `Name updated: ${oldFirstName} ${oldLastName} → ${input.firstName} ${input.lastName}`, 'success'));

  addStep(task, createStep('niid', 'NIID update not required for name correction', 'skipped'));
}

async function runEpinNameCorrection(task: Task, input: NameCorrectionInput, worker: Worker, signal: AbortSignal) {
  const page = await prepareWorkerEPINPage(worker);
  addStep(task, createStep('epin', 'E-PIN session ready', 'success'));
  checkCancelled(signal);

  await searchEPINPolicy(page, input.policyNumber);
  addStep(task, createStep('epin', `Search policy: ${input.policyNumber}`, 'success'));
  checkCancelled(signal);

  const { oldFirstName, oldLastName } = await correctEPINName(page, input.firstName, input.lastName);
  task.previousData = { firstName: oldFirstName, lastName: oldLastName };
  task.newData = { firstName: input.firstName, lastName: input.lastName };
  addStep(task, createStep('epin', `Name updated: ${oldFirstName} ${oldLastName} → ${input.firstName} ${input.lastName}`, 'success'));

  checkCancelled(signal);

  const currentRegNumber = await page.getByRole('textbox', {
    name: 'Rgeistration No',
    exact: true,
  }).inputValue();

  const niipPage = await prepareWorkerNIIPPage(worker);
  addStep(task, createStep('niip', 'NIIP session ready', 'success'));
  checkCancelled(signal);

  await searchNIIPPolicy(niipPage, input.policyNumber, currentRegNumber);
  addStep(task, createStep('niip', `NIIP search: policy ${input.policyNumber} + reg ${currentRegNumber}`, 'success'));
  checkCancelled(signal);

  const oldFullName = await correctNIIPName(niipPage, input.firstName, input.lastName);
  task.previousData = {
    ...task.previousData,
    niipName: oldFullName,
  };
  addStep(task, createStep('niip', `NIIP name updated to: ${(input.firstName + ' ' + input.lastName).trim()}`, 'success'));
}

// ============================================
// Registration Correction (Both sites)
// ============================================

async function runRegistrationCorrection(task: Task, input: RegistrationCorrectionInput, worker: Worker, signal: AbortSignal) {
  const agPage = await prepareWorkerAGPage(worker);
  addStep(task, createStep('ag', 'A&G session ready', 'success'));
  checkCancelled(signal);

  await searchPolicy(agPage, input.policyNumber);
  addStep(task, createStep('ag', `Search policy: ${input.policyNumber}`, 'success'));
  checkCancelled(signal);

  const oldRegNumber = await correctRegistration(agPage, input.newRegistrationNumber);
  task.previousData = { registrationNumber: oldRegNumber };
  task.newData = { registrationNumber: input.newRegistrationNumber };
  addStep(task, createStep('ag', `Registration updated: ${oldRegNumber} → ${input.newRegistrationNumber}`, 'success'));
  checkCancelled(signal);

  const niidPage = await prepareWorkerNIIDPage(worker);
  addStep(task, createStep('niid', 'NIID session ready', 'success'));
  checkCancelled(signal);

  await searchNIIDPolicy(niidPage, input.policyNumber, oldRegNumber);
  addStep(task, createStep('niid', `NIID search: policy ${input.policyNumber} + reg ${oldRegNumber}`, 'success'));
  checkCancelled(signal);

  await correctNIIDRegistration(niidPage, input.newRegistrationNumber);
  addStep(task, createStep('niid', `NIID registration updated to: ${input.newRegistrationNumber}`, 'success'));
}

// ============================================
// Vehicle Make Correction (A&G only)
// ============================================

async function runVehicleMakeCorrection(task: Task, input: VehicleMakeCorrectionInput, worker: Worker, signal: AbortSignal) {
  const page = await prepareWorkerAGPage(worker);
  addStep(task, createStep('ag', 'A&G session ready', 'success'));
  checkCancelled(signal);

  await searchPolicy(page, input.policyNumber);
  addStep(task, createStep('ag', `Search policy: ${input.policyNumber}`, 'success'));
  checkCancelled(signal);

  const { oldMake, oldModel } = await correctVehicleMake(page, input.newVehicleMake, input.newVehicleModel);
  task.previousData = { vehicleMake: oldMake, vehicleModel: oldModel };
  task.newData = { vehicleMake: input.newVehicleMake, vehicleModel: input.newVehicleModel };
  addStep(task, createStep('ag', `Vehicle updated: ${oldMake} ${oldModel} → ${input.newVehicleMake} ${input.newVehicleModel}`, 'success'));

  addStep(task, createStep('niid', 'NIID update not required for vehicle make correction', 'skipped'));
}

async function runEpinVehicleMakeCorrection(task: Task, input: VehicleMakeCorrectionInput, worker: Worker, signal: AbortSignal) {
  const page = await prepareWorkerEPINPage(worker);
  addStep(task, createStep('epin', 'E-PIN session ready', 'success'));
  checkCancelled(signal);

  await searchEPINPolicy(page, input.policyNumber);
  addStep(task, createStep('epin', `Search policy: ${input.policyNumber}`, 'success'));
  checkCancelled(signal);

  const { oldMake, oldModel } = await correctEPINVehicleMake(page, input.newVehicleMake, input.newVehicleModel);
  task.previousData = { vehicleMake: oldMake, vehicleModel: oldModel };
  task.newData = { vehicleMake: input.newVehicleMake, vehicleModel: input.newVehicleModel };
  addStep(task, createStep('epin', `Vehicle updated: ${oldMake} ${oldModel} → ${input.newVehicleMake} ${input.newVehicleModel}`, 'success'));

  addStep(task, createStep('niip', 'NIIP update not required for vehicle make correction', 'skipped'));
}

// ============================================
// Reg and Chassis Correction (Both sites)
// ============================================

async function runRegAndChassisCorrection(task: Task, input: RegAndChassisCorrectionInput, worker: Worker, signal: AbortSignal) {
  const agPage = await prepareWorkerAGPage(worker);
  addStep(task, createStep('ag', 'A&G session ready', 'success'));
  checkCancelled(signal);

  await searchPolicy(agPage, input.policyNumber);
  addStep(task, createStep('ag', `Search policy: ${input.policyNumber}`, 'success'));
  checkCancelled(signal);

  const { oldRegNumber, oldChassisNumber } = await correctRegandChasis(agPage, input.newRegistrationNumber, input.newChassisNumber);
  task.previousData = { registrationNumber: oldRegNumber, chassisNumber: oldChassisNumber };
  task.newData = { registrationNumber: input.newRegistrationNumber, chassisNumber: input.newChassisNumber };
  addStep(task, createStep('ag', `Reg: ${oldRegNumber} → ${input.newRegistrationNumber}, Chassis: ${oldChassisNumber} → ${input.newChassisNumber}`, 'success'));
  checkCancelled(signal);

  const niidPage = await prepareWorkerNIIDPage(worker);
  addStep(task, createStep('niid', 'NIID session ready', 'success'));
  checkCancelled(signal);

  await searchNIIDPolicy(niidPage, input.policyNumber, oldRegNumber);
  addStep(task, createStep('niid', `NIID search: policy ${input.policyNumber} + reg ${oldRegNumber}`, 'success'));
  checkCancelled(signal);

  await correctNIIDRegAndChassis(niidPage, input.newRegistrationNumber, input.newChassisNumber);
  addStep(task, createStep('niid', `NIID registration updated to: ${input.newRegistrationNumber} + chassis updated to: ${input.newChassisNumber}`, 'success'));
}

// ============================================
// Chassis Correction (Both sites)
// ============================================

async function runChassisCorrection(task: Task, input: ChassisCorrectionInput, worker: Worker, signal: AbortSignal) {
  // --- A&G ---
  const agPage = await prepareWorkerAGPage(worker);
  addStep(task, createStep('ag', 'A&G session ready', 'success'));
  checkCancelled(signal);

  await searchPolicy(agPage, input.policyNumber);
  addStep(task, createStep('ag', `Search policy: ${input.policyNumber}`, 'success'));
  checkCancelled(signal);

  // Read the current reg number before correcting (needed for NIID search)
  const currentRegNumber = await agPage.inputValue('internal:role=textbox[name="Rgeistration No"i]');

  const oldChassisNumber = await correctChassis(agPage, input.newChassisNumber);
  task.previousData = { chassisNumber: oldChassisNumber };
  task.newData = { chassisNumber: input.newChassisNumber };
  addStep(task, createStep('ag', `Chassis updated: ${oldChassisNumber} → ${input.newChassisNumber}`, 'success'));
  checkCancelled(signal);

  // --- NIID ---
  const niidPage = await prepareWorkerNIIDPage(worker);
  addStep(task, createStep('niid', 'NIID session ready', 'success'));
  checkCancelled(signal);

  await searchNIIDPolicy(niidPage, input.policyNumber, currentRegNumber);
  addStep(task, createStep('niid', `NIID search: policy ${input.policyNumber} + reg ${currentRegNumber}`, 'success'));
  checkCancelled(signal);

  await correctNIIDChassis(niidPage, input.newChassisNumber);
  addStep(task, createStep('niid', `NIID chassis updated to: ${input.newChassisNumber}`, 'success'));
}

async function runEpinRegistrationCorrection(task: Task, input: RegistrationCorrectionInput, worker: Worker, signal: AbortSignal) {
  const epinPage = await prepareWorkerEPINPage(worker);
  addStep(task, createStep('epin', 'E-PIN session ready', 'success'));
  checkCancelled(signal);

  await searchEPINPolicy(epinPage, input.policyNumber);
  addStep(task, createStep('epin', `Search policy: ${input.policyNumber}`, 'success'));
  checkCancelled(signal);

  const oldRegNumber = await correctEPINRegistration(epinPage, input.newRegistrationNumber);
  task.previousData = { registrationNumber: oldRegNumber };
  task.newData = { registrationNumber: input.newRegistrationNumber };
  addStep(task, createStep('epin', `Registration updated: ${oldRegNumber} → ${input.newRegistrationNumber}`, 'success'));
  checkCancelled(signal);

  const niipPage = await prepareWorkerNIIPPage(worker);
  addStep(task, createStep('niip', 'NIIP session ready', 'success'));
  checkCancelled(signal);

  await searchNIIPPolicy(niipPage, input.policyNumber, oldRegNumber);
  addStep(task, createStep('niip', `NIIP search: policy ${input.policyNumber} + reg ${oldRegNumber}`, 'success'));
  checkCancelled(signal);

  await correctNIIPRegistration(niipPage, input.newRegistrationNumber);
  addStep(task, createStep('niip', `NIIP registration updated to: ${input.newRegistrationNumber}`, 'success'));
}

async function runEpinRegAndChassisCorrection(task: Task, input: RegAndChassisCorrectionInput, worker: Worker, signal: AbortSignal) {
  const epinPage = await prepareWorkerEPINPage(worker);
  addStep(task, createStep('epin', 'E-PIN session ready', 'success'));
  checkCancelled(signal);

  await searchEPINPolicy(epinPage, input.policyNumber);
  addStep(task, createStep('epin', `Search policy: ${input.policyNumber}`, 'success'));
  checkCancelled(signal);

  const { oldRegNumber, oldChassisNumber } = await correctEPINRegAndChassis(epinPage, input.newRegistrationNumber, input.newChassisNumber);
  task.previousData = { registrationNumber: oldRegNumber, chassisNumber: oldChassisNumber };
  task.newData = { registrationNumber: input.newRegistrationNumber, chassisNumber: input.newChassisNumber };
  addStep(task, createStep('epin', `Reg: ${oldRegNumber} → ${input.newRegistrationNumber}, Chassis: ${oldChassisNumber} → ${input.newChassisNumber}`, 'success'));
  checkCancelled(signal);

  const niipPage = await prepareWorkerNIIPPage(worker);
  addStep(task, createStep('niip', 'NIIP session ready', 'success'));
  checkCancelled(signal);

  await searchNIIPPolicy(niipPage, input.policyNumber, oldRegNumber);
  addStep(task, createStep('niip', `NIIP search: policy ${input.policyNumber} + reg ${oldRegNumber}`, 'success'));
  checkCancelled(signal);

  await correctNIIPRegAndChassis(niipPage, input.newRegistrationNumber, input.newChassisNumber);
  addStep(task, createStep('niip', `NIIP registration updated to: ${input.newRegistrationNumber} + chassis updated to: ${input.newChassisNumber}`, 'success'));
}

async function runEpinChassisCorrection(task: Task, input: ChassisCorrectionInput, worker: Worker, signal: AbortSignal) {
  const epinPage = await prepareWorkerEPINPage(worker);
  addStep(task, createStep('epin', 'E-PIN session ready', 'success'));
  checkCancelled(signal);

  await searchEPINPolicy(epinPage, input.policyNumber);
  addStep(task, createStep('epin', `Search policy: ${input.policyNumber}`, 'success'));
  checkCancelled(signal);

  const currentRegNumber = await epinPage.getByRole('textbox', {
    name: 'Rgeistration No',
    exact: true,
  }).inputValue();
  const oldChassisNumber = await correctEPINChassis(epinPage, input.newChassisNumber);
  task.previousData = { chassisNumber: oldChassisNumber };
  task.newData = { chassisNumber: input.newChassisNumber };
  addStep(task, createStep('epin', `Chassis updated: ${oldChassisNumber} → ${input.newChassisNumber}`, 'success'));
  checkCancelled(signal);

  const niipPage = await prepareWorkerNIIPPage(worker);
  addStep(task, createStep('niip', 'NIIP session ready', 'success'));
  checkCancelled(signal);

  await searchNIIPPolicy(niipPage, input.policyNumber, currentRegNumber);
  addStep(task, createStep('niip', `NIIP search: policy ${input.policyNumber} + reg ${currentRegNumber}`, 'success'));
  checkCancelled(signal);

  await correctNIIPChassis(niipPage, input.newChassisNumber);
  addStep(task, createStep('niip', `NIIP chassis updated to: ${input.newChassisNumber}`, 'success'));
}

// ============================================
// Getters
// ============================================

export function cancelCorrection(taskId: string): boolean {
  const controller = abortControllers.get(taskId);
  if (!controller) return false;
  controller.abort();
  return true;
}

export function getRunningTasks(): Task[] {
  return Array.from(runningTasks.values());
}

export function getTaskHistory(): Task[] {
  return taskHistory;
}
