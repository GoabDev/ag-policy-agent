import { v4 as uuid } from 'uuid';
import { Page } from 'playwright';
import {
  CorrectionInput,
  Task,
  TaskStep,
  NameCorrectionInput,
  RegistrationCorrectionInput,
  SwapCorrectionInput,
  VehicleMakeCorrectionInput,
  RegAndChassisCorrectionInput,
  ChassisCorrectionInput,
  Worker,
  SiteName,
} from '../types';
import { log, emitEvent, saveTaskLog } from '../utils/logger';
import { searchPolicy, correctName, correctRegistration, correctRegandChasis, correctChassis, correctVehicleMake, loginToAG, navigateToPolicy, AG_SELECTORS } from '../browser/actions/ag';
import { searchNIIDPolicy, correctNIIDRegistration, correctNIIDRegAndChassis, correctNIIDChassis } from '../browser/actions/niid';
import { searchEPINPolicy, correctEPINName, correctEPINRegistration, correctEPINRegAndChassis, correctEPINChassis, correctEPINVehicleMake, applyEPINSwap } from '../browser/actions/epin';
import { searchNIIPPolicy, correctNIIPName, correctNIIPRegistration, correctNIIPRegAndChassis, correctNIIPChassis, correctNIIPVehicleMakeModel, applyNIIPSwap } from '../browser/actions/niip';
import { acquireWorker, awaitWorkerPreload, releaseWorker } from '../browser/workerPool';
import { touchSession, touchWorkActivity } from '../browser/controller';
import { config } from '../config';
import { getPolicyChannel } from '../utils/policyClassifier';
import { getNetworkTimeoutMs, getQuickCheckTimeoutMs } from '../browser/timeoutSettings';

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
    await page.waitForSelector('internal:text="Dashboard"', { timeout: getNetworkTimeoutMs() });
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
    await page.waitForSelector('internal:text="Dashboard"', { timeout: getQuickCheckTimeoutMs() });
  } catch {
    await page.fill('internal:role=textbox[name="Username"i]', config.ag.username);
    await page.fill('internal:role=textbox[name="Password"i]', config.ag.password);
    await page.click('internal:role=button[name="Logon"i]');
    await page.waitForSelector('internal:text="Dashboard"', { timeout: getNetworkTimeoutMs() });
  }

  await page.click('internal:role=link[name=" Policy Operations "i]');
  await page.click('internal:role=link[name="Update Policy"i]');
  return page;
}

async function prepareWorkerNIIDPage(worker: Worker): Promise<Page> {
  const page = worker.pages.get('niid')!;
  await awaitWorkerPreload(worker, 'niid');
  const currentUrl = page.url();

  if (currentUrl.includes('/default.aspx')) {
    throw new Error('NIID session has expired. Please login to NIID manually and retry.');
  }

  if (currentUrl.includes('Change_Request.aspx')) {
    touchSession('niid');
    return page;
  }

  // Navigate to park page
  await page.goto(config.niid.policyCorrectionUrl, { waitUntil: 'domcontentloaded', timeout: getNetworkTimeoutMs() });

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
    await page.goto(config.epin.parkUrl, { waitUntil: 'domcontentloaded', timeout: getNetworkTimeoutMs() });
    return page;
  }

  if (currentUrl.includes('policyupdateniip.aspx')) {
    touchSession('epin');
    return page;
  }

  await page.goto(config.epin.parkUrl, { waitUntil: 'domcontentloaded', timeout: getNetworkTimeoutMs() });
  touchSession('epin');
  return page;
}

async function prepareWorkerNIIPPage(worker: Worker): Promise<Page> {
  const page = worker.pages.get('niip')!;
  await awaitWorkerPreload(worker, 'niip');
  const currentUrl = page.url().toLowerCase();

  if (currentUrl.includes('/home/index')) {
    log(`Worker ${worker.id}: NIIP session expired, re-logging in...`, 'warn');
    await page.goto(config.niip.url, { waitUntil: 'networkidle' });
    await page.fill('input[name="Username"]', config.niip.username);
    await page.fill('input[name="Password"]', config.niip.password);
    await page.click('button[type="submit"]');
    await page.goto(config.niip.parkUrl, { waitUntil: 'domcontentloaded', timeout: getNetworkTimeoutMs() });
    return page;
  }

  if (currentUrl.includes('/company/activepolicies')) {
    touchSession('niip');
    return page;
  }

  await page.goto(config.niip.parkUrl, { waitUntil: 'domcontentloaded', timeout: getNetworkTimeoutMs() });
  touchSession('niip');
  return page;
}

function getPortalTarget(input: CorrectionInput): 'auto' | 'primary' | 'secondary' {
  if (input.portalTarget === 'primary' || input.portalTarget === 'secondary') {
    return input.portalTarget;
  }
  return 'auto';
}

function getPrimarySite(
  policyChannel: ReturnType<typeof getPolicyChannel>,
  portalTarget: 'auto' | 'primary' | 'secondary',
): 'ag' | 'niid' | 'epin' | 'niip' {
  if (policyChannel === 'epin') {
    return portalTarget === 'secondary' ? 'niip' : 'epin';
  }

  return portalTarget === 'secondary' ? 'niid' : 'ag';
}

function getCorrectionSites(
  input: CorrectionInput,
  policyChannel: ReturnType<typeof getPolicyChannel>,
  portalTarget: 'auto' | 'primary' | 'secondary',
): SiteName[] {
  if (policyChannel === 'epin') {
    if (portalTarget === 'secondary') return ['niip'];
    if (portalTarget === 'primary') return ['epin'];
    return ['epin', 'niip'];
  }

  if (portalTarget === 'primary') {
    return ['ag'];
  }

  if (portalTarget === 'secondary') {
    return input.previousRegistrationNumber ? ['niid'] : ['ag', 'niid'];
  }

  return input.type === 'registration' || input.type === 'reg_and_chassis' || input.type === 'chassis'
    ? ['ag', 'niid']
    : ['ag'];
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
  const portalTarget = getPortalTarget(input);
  const primarySite = getPrimarySite(policyChannel, portalTarget);
  const sites = getCorrectionSites(input, policyChannel, portalTarget);

  // Reset inactivity timer — real work is happening
  for (const s of sites) touchWorkActivity(s);

  // Acquire a worker from the pool
  let worker: Worker;
  try {
    checkCancelled(signal);
    worker = await acquireWorker(sites, { signal });
    addStep(task, createStep(primarySite, `Worker ${worker.id} assigned`, 'success'));
  } catch (err: any) {
    if (err instanceof CancellationError || signal.aborted) {
      task.status = 'cancelled';
      task.completedAt = new Date().toISOString();
      addStep(task, createStep(primarySite, 'Task cancelled by user', 'failed'));
      log(`Task cancelled: ${task.id}`);
    } else {
      task.status = 'failed';
      task.error = `Failed to acquire worker: ${err.message}`;
      task.completedAt = new Date().toISOString();
      addStep(task, createStep(primarySite, 'Failed to acquire worker', 'failed', err.message));
    }
    runningTasks.delete(task.id);
    abortControllers.delete(task.id);
    taskHistory.unshift(task);
    saveTaskLog(task.id, task);
    if (task.status === 'cancelled') {
      emitEvent('task:cancelled', { taskId: task.id });
    } else {
      emitEvent('task:failed', { taskId: task.id, error: task.error });
    }
    return task;
  }

  try {
    await runTargetedCorrection(task, input, worker, signal, policyChannel, portalTarget);

    task.status = 'completed';
    task.completedAt = new Date().toISOString();
    log(`Task completed: ${task.id}`);
  } catch (err: any) {
    if (err instanceof CancellationError) {
      task.status = 'cancelled';
      task.completedAt = new Date().toISOString();
      addStep(task, createStep(primarySite, 'Task cancelled by user', 'failed'));
      log(`Task cancelled: ${task.id}`);
    } else {
      task.status = 'failed';
      task.error = err.message;
      task.completedAt = new Date().toISOString();
      addStep(task, createStep(primarySite, 'error', 'failed', err.message));
      log(`Task failed: ${task.id} — ${err.message}`, 'error');
    }
  } finally {
    await releaseWorker(worker.id, { destroy: task.status !== 'completed' });
  }

  // Save to history
  runningTasks.delete(task.id);
  abortControllers.delete(task.id);
  taskHistory.unshift(task);
  saveTaskLog(task.id, task);

  if (task.status === 'completed') {
    emitEvent('task:completed', { taskId: task.id });
  } else if (task.status === 'cancelled') {
    emitEvent('task:cancelled', { taskId: task.id });
  } else {
    emitEvent('task:failed', { taskId: task.id, error: task.error });
  }

  return task;
}

async function runTargetedCorrection(
  task: Task,
  input: CorrectionInput,
  worker: Worker,
  signal: AbortSignal,
  policyChannel: ReturnType<typeof getPolicyChannel>,
  portalTarget: 'auto' | 'primary' | 'secondary',
) {
  if (portalTarget === 'auto') {
    switch (input.type) {
      case 'name':
        await (policyChannel === 'epin'
          ? runEpinAndNIIPNameCorrection(task, input, worker, signal)
          : runNameCorrection(task, input, worker, signal));
        return;
      case 'registration':
        await (policyChannel === 'epin'
          ? runEpinAndNIIPRegistrationCorrection(task, input, worker, signal)
          : runScratchAndNIIDRegistrationCorrection(task, input, worker, signal));
        return;
      case 'vehicle_make':
        await (policyChannel === 'epin'
          ? runEpinAndNIIPVehicleMakeCorrection(task, input, worker, signal)
          : runVehicleMakeCorrection(task, input, worker, signal));
        return;
      case 'reg_and_chassis':
        await (policyChannel === 'epin'
          ? runEpinAndNIIPRegAndChassisCorrection(task, input, worker, signal)
          : runScratchAndNIIDRegAndChassisCorrection(task, input, worker, signal));
        return;
      case 'chassis':
        await (policyChannel === 'epin'
          ? runEpinAndNIIPChassisCorrection(task, input, worker, signal)
          : runScratchAndNIIDChassisCorrection(task, input, worker, signal));
        return;
      case 'swap':
        if (policyChannel !== 'epin') {
          throw new Error('Swap is currently supported only for e-pin policies');
        }
        await runEpinAndNIIPSwapCorrection(task, input, worker, signal);
        return;
      default:
        throw new Error(`Unknown correction type: ${(input as any).type}`);
    }
  }

  if (portalTarget === 'primary') {
    switch (input.type) {
      case 'name':
        await (policyChannel === 'epin'
          ? runEpinNameCorrection(task, input, worker, signal)
          : runNameCorrection(task, input, worker, signal));
        return;
      case 'registration':
        await (policyChannel === 'epin'
          ? runEpinRegistrationCorrection(task, input, worker, signal)
          : runRegistrationCorrection(task, input, worker, signal));
        return;
      case 'vehicle_make':
        await (policyChannel === 'epin'
          ? runEpinVehicleMakeCorrection(task, input, worker, signal)
          : runVehicleMakeCorrection(task, input, worker, signal));
        return;
      case 'reg_and_chassis':
        await (policyChannel === 'epin'
          ? runEpinRegAndChassisCorrection(task, input, worker, signal)
          : runRegAndChassisCorrection(task, input, worker, signal));
        return;
      case 'chassis':
        await (policyChannel === 'epin'
          ? runEpinChassisCorrection(task, input, worker, signal)
          : runChassisCorrection(task, input, worker, signal));
        return;
      case 'swap':
        if (policyChannel !== 'epin') {
          throw new Error('Swap is currently supported only for e-pin policies');
        }
        await runEpinSwapCorrection(task, input, worker, signal);
        return;
      default:
        throw new Error(`Unknown correction type: ${(input as any).type}`);
    }
  }

  if (policyChannel === 'epin') {
    switch (input.type) {
      case 'name':
        await runNIIPNameCorrection(task, input, worker, signal);
        return;
      case 'registration':
        await runNIIPRegistrationCorrection(task, input, worker, signal);
        return;
      case 'vehicle_make':
        await runNIIPVehicleMakeCorrection(task, input, worker, signal);
        return;
      case 'reg_and_chassis':
        await runNIIPRegAndChassisCorrection(task, input, worker, signal);
        return;
      case 'chassis':
        await runNIIPChassisCorrection(task, input, worker, signal);
        return;
      case 'swap':
        await runNIIPSwapCorrection(task, input, worker, signal);
        return;
      default:
        throw new Error(`Unknown correction type: ${(input as any).type}`);
    }
  }

  switch (input.type) {
    case 'registration':
      await runNIIDRegistrationOnlyCorrection(task, input, worker, signal);
      return;
    case 'reg_and_chassis':
      await runNIIDRegAndChassisOnlyCorrection(task, input, worker, signal);
      return;
    case 'chassis':
      await runNIIDChassisOnlyCorrection(task, input, worker, signal);
      return;
    default:
      throw new Error('NIID-only corrections currently support registration and chassis updates only');
  }
}

async function getNIIDPreviousRegistrationNumber(
  task: Task,
  input: CorrectionInput,
  worker: Worker,
  signal: AbortSignal,
): Promise<string> {
  if (input.previousRegistrationNumber?.trim()) {
    return input.previousRegistrationNumber.trim();
  }

  const agPage = await prepareWorkerAGPage(worker);
  addStep(task, createStep('ag', 'Scratch Card session ready for registration lookup', 'success'));
  checkCancelled(signal);

  await searchPolicy(agPage, input.policyNumber);
  addStep(task, createStep('ag', `Read Scratch Card policy: ${input.policyNumber}`, 'success'));
  checkCancelled(signal);

  const previousRegistrationNumber = await agPage.inputValue('internal:role=textbox[name="Rgeistration No"i]');
  addStep(task, createStep('ag', `Previous registration read: ${previousRegistrationNumber}`, 'success'));
  return previousRegistrationNumber;
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

}

async function runEpinAndNIIPNameCorrection(task: Task, input: NameCorrectionInput, worker: Worker, signal: AbortSignal) {
  const page = await prepareWorkerEPINPage(worker);
  addStep(task, createStep('epin', 'E-PIN session ready', 'success'));
  checkCancelled(signal);

  await searchEPINPolicy(page, input.policyNumber);
  addStep(task, createStep('epin', `Search policy: ${input.policyNumber}`, 'success'));
  checkCancelled(signal);

  const currentRegNumber = await page.getByRole('textbox', {
    name: 'Rgeistration No',
    exact: true,
  }).inputValue();
  const { oldFirstName, oldLastName } = await correctEPINName(page, input.firstName, input.lastName);
  task.previousData = { firstName: oldFirstName, lastName: oldLastName };
  task.newData = { firstName: input.firstName, lastName: input.lastName };
  addStep(task, createStep('epin', `Name updated: ${oldFirstName} ${oldLastName} → ${input.firstName} ${input.lastName}`, 'success'));
  checkCancelled(signal);

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
// Registration Correction (Scratch Card only)
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
}

async function runScratchAndNIIDRegistrationCorrection(task: Task, input: RegistrationCorrectionInput, worker: Worker, signal: AbortSignal) {
  await runRegistrationCorrection(task, input, worker, signal);
  checkCancelled(signal);

  const oldRegNumber = task.previousData?.registrationNumber;
  if (!oldRegNumber) throw new Error('Could not read previous registration number from Scratch Card');

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
}

async function runEpinAndNIIPVehicleMakeCorrection(task: Task, input: VehicleMakeCorrectionInput, worker: Worker, signal: AbortSignal) {
  const page = await prepareWorkerEPINPage(worker);
  addStep(task, createStep('epin', 'E-PIN session ready', 'success'));
  checkCancelled(signal);

  await searchEPINPolicy(page, input.policyNumber);
  addStep(task, createStep('epin', `Search policy: ${input.policyNumber}`, 'success'));
  checkCancelled(signal);

  const currentRegNumber = await page.getByRole('textbox', {
    name: 'Rgeistration No',
    exact: true,
  }).inputValue();
  const { oldMake, oldModel } = await correctEPINVehicleMake(page, input.newVehicleMake, input.newVehicleModel);
  task.previousData = { vehicleMake: oldMake, vehicleModel: oldModel };
  task.newData = { vehicleMake: input.newVehicleMake, vehicleModel: input.newVehicleModel };
  addStep(task, createStep('epin', `Vehicle updated: ${oldMake} ${oldModel} → ${input.newVehicleMake} ${input.newVehicleModel}`, 'success'));
  checkCancelled(signal);

  const niipPage = await prepareWorkerNIIPPage(worker);
  addStep(task, createStep('niip', 'NIIP session ready', 'success'));
  checkCancelled(signal);

  await searchNIIPPolicy(niipPage, input.policyNumber, currentRegNumber);
  addStep(task, createStep('niip', `NIIP search: policy ${input.policyNumber} + reg ${currentRegNumber}`, 'success'));
  checkCancelled(signal);

  const { oldMake: oldNiipMake, oldModel: oldNiipModel } = await correctNIIPVehicleMakeModel(
    niipPage,
    input.newVehicleMake,
    input.newVehicleModel,
  );
  task.previousData = {
    ...task.previousData,
    niipVehicleMake: oldNiipMake,
    niipVehicleModel: oldNiipModel,
  };
  addStep(task, createStep('niip', `NIIP vehicle updated: ${oldNiipMake} ${oldNiipModel} → ${input.newVehicleMake} ${input.newVehicleModel}`, 'success'));
}

// ============================================
// Reg and Chassis Correction (Scratch Card only)
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
}

async function runScratchAndNIIDRegAndChassisCorrection(task: Task, input: RegAndChassisCorrectionInput, worker: Worker, signal: AbortSignal) {
  await runRegAndChassisCorrection(task, input, worker, signal);
  checkCancelled(signal);

  const oldRegNumber = task.previousData?.registrationNumber;
  if (!oldRegNumber) throw new Error('Could not read previous registration number from Scratch Card');

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
// Chassis Correction (Scratch Card only)
// ============================================

async function runChassisCorrection(task: Task, input: ChassisCorrectionInput, worker: Worker, signal: AbortSignal) {
  // --- A&G ---
  const agPage = await prepareWorkerAGPage(worker);
  addStep(task, createStep('ag', 'A&G session ready', 'success'));
  checkCancelled(signal);

  await searchPolicy(agPage, input.policyNumber);
  addStep(task, createStep('ag', `Search policy: ${input.policyNumber}`, 'success'));
  checkCancelled(signal);

  const oldChassisNumber = await correctChassis(agPage, input.newChassisNumber);
  task.previousData = { chassisNumber: oldChassisNumber };
  task.newData = { chassisNumber: input.newChassisNumber };
  addStep(task, createStep('ag', `Chassis updated: ${oldChassisNumber} → ${input.newChassisNumber}`, 'success'));
}

async function runScratchAndNIIDChassisCorrection(task: Task, input: ChassisCorrectionInput, worker: Worker, signal: AbortSignal) {
  const agPage = await prepareWorkerAGPage(worker);
  addStep(task, createStep('ag', 'A&G session ready', 'success'));
  checkCancelled(signal);

  await searchPolicy(agPage, input.policyNumber);
  addStep(task, createStep('ag', `Search policy: ${input.policyNumber}`, 'success'));
  checkCancelled(signal);

  const currentRegNumber = await agPage.inputValue('internal:role=textbox[name="Rgeistration No"i]');
  const oldChassisNumber = await correctChassis(agPage, input.newChassisNumber);
  task.previousData = { chassisNumber: oldChassisNumber };
  task.newData = { chassisNumber: input.newChassisNumber };
  addStep(task, createStep('ag', `Chassis updated: ${oldChassisNumber} → ${input.newChassisNumber}`, 'success'));
  checkCancelled(signal);

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
}

async function runEpinAndNIIPRegistrationCorrection(task: Task, input: RegistrationCorrectionInput, worker: Worker, signal: AbortSignal) {
  await runEpinRegistrationCorrection(task, input, worker, signal);
  checkCancelled(signal);

  const oldRegNumber = task.previousData?.registrationNumber || '';
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
}

async function runEpinAndNIIPRegAndChassisCorrection(task: Task, input: RegAndChassisCorrectionInput, worker: Worker, signal: AbortSignal) {
  await runEpinRegAndChassisCorrection(task, input, worker, signal);
  checkCancelled(signal);

  const oldRegNumber = task.previousData?.registrationNumber || '';
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

  const oldChassisNumber = await correctEPINChassis(epinPage, input.newChassisNumber);
  task.previousData = { chassisNumber: oldChassisNumber };
  task.newData = { chassisNumber: input.newChassisNumber };
  addStep(task, createStep('epin', `Chassis updated: ${oldChassisNumber} → ${input.newChassisNumber}`, 'success'));
}

async function runEpinAndNIIPChassisCorrection(task: Task, input: ChassisCorrectionInput, worker: Worker, signal: AbortSignal) {
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

async function runNIIDRegistrationOnlyCorrection(task: Task, input: RegistrationCorrectionInput, worker: Worker, signal: AbortSignal) {
  const previousRegistrationNumber = await getNIIDPreviousRegistrationNumber(task, input, worker, signal);
  const niidPage = await prepareWorkerNIIDPage(worker);
  addStep(task, createStep('niid', 'NIID session ready', 'success'));
  checkCancelled(signal);

  await searchNIIDPolicy(niidPage, input.policyNumber, previousRegistrationNumber);
  addStep(task, createStep('niid', `NIID search: policy ${input.policyNumber} + reg ${previousRegistrationNumber}`, 'success'));
  checkCancelled(signal);

  await correctNIIDRegistration(niidPage, input.newRegistrationNumber);
  task.previousData = { registrationNumber: previousRegistrationNumber };
  task.newData = { registrationNumber: input.newRegistrationNumber };
  addStep(task, createStep('niid', `NIID registration updated to: ${input.newRegistrationNumber}`, 'success'));
}

async function runNIIDRegAndChassisOnlyCorrection(task: Task, input: RegAndChassisCorrectionInput, worker: Worker, signal: AbortSignal) {
  const previousRegistrationNumber = await getNIIDPreviousRegistrationNumber(task, input, worker, signal);
  const niidPage = await prepareWorkerNIIDPage(worker);
  addStep(task, createStep('niid', 'NIID session ready', 'success'));
  checkCancelled(signal);

  await searchNIIDPolicy(niidPage, input.policyNumber, previousRegistrationNumber);
  addStep(task, createStep('niid', `NIID search: policy ${input.policyNumber} + reg ${previousRegistrationNumber}`, 'success'));
  checkCancelled(signal);

  await correctNIIDRegAndChassis(niidPage, input.newRegistrationNumber, input.newChassisNumber);
  task.previousData = { registrationNumber: previousRegistrationNumber };
  task.newData = { registrationNumber: input.newRegistrationNumber, chassisNumber: input.newChassisNumber };
  addStep(task, createStep('niid', `NIID registration updated to: ${input.newRegistrationNumber} + chassis updated to: ${input.newChassisNumber}`, 'success'));
}

async function runNIIDChassisOnlyCorrection(task: Task, input: ChassisCorrectionInput, worker: Worker, signal: AbortSignal) {
  const previousRegistrationNumber = await getNIIDPreviousRegistrationNumber(task, input, worker, signal);
  const niidPage = await prepareWorkerNIIDPage(worker);
  addStep(task, createStep('niid', 'NIID session ready', 'success'));
  checkCancelled(signal);

  await searchNIIDPolicy(niidPage, input.policyNumber, previousRegistrationNumber);
  addStep(task, createStep('niid', `NIID search: policy ${input.policyNumber} + reg ${previousRegistrationNumber}`, 'success'));
  checkCancelled(signal);

  await correctNIIDChassis(niidPage, input.newChassisNumber);
  task.previousData = { registrationNumber: previousRegistrationNumber };
  task.newData = { chassisNumber: input.newChassisNumber };
  addStep(task, createStep('niid', `NIID chassis updated to: ${input.newChassisNumber}`, 'success'));
}

async function runNIIPNameCorrection(task: Task, input: NameCorrectionInput, worker: Worker, signal: AbortSignal) {
  const niipPage = await prepareWorkerNIIPPage(worker);
  addStep(task, createStep('niip', 'NIIP session ready', 'success'));
  checkCancelled(signal);

  await searchNIIPPolicy(niipPage, input.policyNumber, '');
  addStep(task, createStep('niip', `NIIP search: policy ${input.policyNumber}`, 'success'));
  checkCancelled(signal);

  const oldFullName = await correctNIIPName(niipPage, input.firstName, input.lastName);
  task.previousData = { name: oldFullName };
  task.newData = { firstName: input.firstName, lastName: input.lastName };
  addStep(task, createStep('niip', `NIIP name updated to: ${(input.firstName + ' ' + input.lastName).trim()}`, 'success'));
}

async function runNIIPRegistrationCorrection(task: Task, input: RegistrationCorrectionInput, worker: Worker, signal: AbortSignal) {
  const niipPage = await prepareWorkerNIIPPage(worker);
  addStep(task, createStep('niip', 'NIIP session ready', 'success'));
  checkCancelled(signal);

  await searchNIIPPolicy(niipPage, input.policyNumber, '');
  addStep(task, createStep('niip', `NIIP search: policy ${input.policyNumber}`, 'success'));
  checkCancelled(signal);

  const oldRegNumber = await niipPage.inputValue('internal:role=textbox[name="Registration Number"]');
  await correctNIIPRegistration(niipPage, input.newRegistrationNumber);
  task.previousData = { registrationNumber: oldRegNumber };
  task.newData = { registrationNumber: input.newRegistrationNumber };
  addStep(task, createStep('niip', `NIIP registration updated to: ${input.newRegistrationNumber}`, 'success'));
}

async function runNIIPVehicleMakeCorrection(task: Task, input: VehicleMakeCorrectionInput, worker: Worker, signal: AbortSignal) {
  const niipPage = await prepareWorkerNIIPPage(worker);
  addStep(task, createStep('niip', 'NIIP session ready', 'success'));
  checkCancelled(signal);

  await searchNIIPPolicy(niipPage, input.policyNumber, '');
  addStep(task, createStep('niip', `NIIP search: policy ${input.policyNumber}`, 'success'));
  checkCancelled(signal);

  const { oldMake, oldModel } = await correctNIIPVehicleMakeModel(
    niipPage,
    input.newVehicleMake,
    input.newVehicleModel,
  );
  task.previousData = { vehicleMake: oldMake, vehicleModel: oldModel };
  task.newData = { vehicleMake: input.newVehicleMake, vehicleModel: input.newVehicleModel };
  addStep(task, createStep('niip', `NIIP vehicle updated: ${oldMake} ${oldModel} → ${input.newVehicleMake} ${input.newVehicleModel}`, 'success'));
}

async function runNIIPRegAndChassisCorrection(task: Task, input: RegAndChassisCorrectionInput, worker: Worker, signal: AbortSignal) {
  const niipPage = await prepareWorkerNIIPPage(worker);
  addStep(task, createStep('niip', 'NIIP session ready', 'success'));
  checkCancelled(signal);

  await searchNIIPPolicy(niipPage, input.policyNumber, '');
  addStep(task, createStep('niip', `NIIP search: policy ${input.policyNumber}`, 'success'));
  checkCancelled(signal);

  const oldRegNumber = await niipPage.inputValue('internal:role=textbox[name="Registration Number"]');
  const oldChassisNumber = await niipPage.inputValue('internal:role=textbox[name="Chassis Number"]');
  await correctNIIPRegAndChassis(niipPage, input.newRegistrationNumber, input.newChassisNumber);
  task.previousData = { registrationNumber: oldRegNumber, chassisNumber: oldChassisNumber };
  task.newData = { registrationNumber: input.newRegistrationNumber, chassisNumber: input.newChassisNumber };
  addStep(task, createStep('niip', `NIIP registration updated to: ${input.newRegistrationNumber} + chassis updated to: ${input.newChassisNumber}`, 'success'));
}

async function runNIIPChassisCorrection(task: Task, input: ChassisCorrectionInput, worker: Worker, signal: AbortSignal) {
  const niipPage = await prepareWorkerNIIPPage(worker);
  addStep(task, createStep('niip', 'NIIP session ready', 'success'));
  checkCancelled(signal);

  await searchNIIPPolicy(niipPage, input.policyNumber, '');
  addStep(task, createStep('niip', `NIIP search: policy ${input.policyNumber}`, 'success'));
  checkCancelled(signal);

  const oldChassisNumber = await niipPage.inputValue('internal:role=textbox[name="Chassis Number"]');
  await correctNIIPChassis(niipPage, input.newChassisNumber);
  task.previousData = { chassisNumber: oldChassisNumber };
  task.newData = { chassisNumber: input.newChassisNumber };
  addStep(task, createStep('niip', `NIIP chassis updated to: ${input.newChassisNumber}`, 'success'));
}

function compactSwapFields(input: SwapCorrectionInput): Record<string, string> {
  const entries = Object.entries({
    firstName: input.firstName,
    lastName: input.lastName,
    email: input.email,
    phone: input.phone,
    engineNumber: input.engineNumber,
    newChassisNumber: input.newChassisNumber,
    newRegistrationNumber: input.newRegistrationNumber,
    vehicleColor: input.vehicleColor,
    newVehicleMake: input.newVehicleMake,
    newVehicleModel: input.newVehicleModel,
    vehicleYear: input.vehicleYear,
    address: input.address,
  }).filter(([, value]) => typeof value === 'string' && value.trim().length > 0);

  return Object.fromEntries(entries) as Record<string, string>;
}

async function runEpinSwapCorrection(
  task: Task,
  input: SwapCorrectionInput,
  worker: Worker,
  signal: AbortSignal,
) {
  const updates = compactSwapFields(input);
  if (Object.keys(updates).length === 0) {
    throw new Error('No swap fields were provided');
  }

  const epinPage = await prepareWorkerEPINPage(worker);
  addStep(task, createStep('epin', 'E-PIN session ready', 'success'));
  checkCancelled(signal);

  await searchEPINPolicy(epinPage, input.policyNumber);
  addStep(task, createStep('epin', `Search policy: ${input.policyNumber}`, 'success'));
  checkCancelled(signal);

  const epinPrevious = await applyEPINSwap(epinPage, input);
  task.previousData = { ...epinPrevious };
  task.newData = updates;
  addStep(task, createStep('epin', `Swap updated fields: ${Object.keys(updates).join(', ')}`, 'success'));
}

async function runNIIPSwapCorrection(
  task: Task,
  input: SwapCorrectionInput,
  worker: Worker,
  signal: AbortSignal,
) {
  const updates = compactSwapFields(input);
  if (Object.keys(updates).length === 0) {
    throw new Error('No swap fields were provided');
  }

  const niipPage = await prepareWorkerNIIPPage(worker);
  addStep(task, createStep('niip', 'NIIP session ready', 'success'));
  checkCancelled(signal);

  await searchNIIPPolicy(niipPage, input.policyNumber, '');
  addStep(task, createStep('niip', `NIIP search: policy ${input.policyNumber}`, 'success'));
  checkCancelled(signal);

  const resolvedName = input.firstName || input.lastName
    ? `${input.firstName?.trim() || ''} ${input.lastName?.trim() || ''}`.trim()
    : undefined;

  const niipPrevious = await applyNIIPSwap(niipPage, input, resolvedName);
  task.previousData = { ...niipPrevious };
  task.newData = updates;
  addStep(task, createStep('niip', `NIIP swap updated fields: ${Object.keys(updates).join(', ')}${resolvedName ? ', name' : ''}`, 'success'));
}

async function runEpinAndNIIPSwapCorrection(
  task: Task,
  input: SwapCorrectionInput,
  worker: Worker,
  signal: AbortSignal,
) {
  const updates = compactSwapFields(input);
  if (Object.keys(updates).length === 0) {
    throw new Error('No swap fields were provided');
  }

  const epinPage = await prepareWorkerEPINPage(worker);
  addStep(task, createStep('epin', 'E-PIN session ready', 'success'));
  checkCancelled(signal);

  await searchEPINPolicy(epinPage, input.policyNumber);
  addStep(task, createStep('epin', `Search policy: ${input.policyNumber}`, 'success'));
  checkCancelled(signal);

  const currentFirstName = await epinPage.inputValue('internal:role=textbox[name="First Name"i]');
  const currentLastName = await epinPage.inputValue('internal:role=textbox[name="Last Name"i]');
  const currentRegNumber = await epinPage.getByRole('textbox', {
    name: 'Rgeistration No',
    exact: true,
  }).inputValue();

  const epinPrevious = await applyEPINSwap(epinPage, input);
  task.previousData = { ...epinPrevious };
  task.newData = updates;
  addStep(task, createStep('epin', `Swap updated fields: ${Object.keys(updates).join(', ')}`, 'success'));
  checkCancelled(signal);

  const niipPage = await prepareWorkerNIIPPage(worker);
  addStep(task, createStep('niip', 'NIIP session ready', 'success'));
  checkCancelled(signal);

  await searchNIIPPolicy(niipPage, input.policyNumber, updates.newRegistrationNumber || currentRegNumber);
  addStep(task, createStep('niip', `NIIP search: policy ${input.policyNumber} + reg ${updates.newRegistrationNumber || currentRegNumber}`, 'success'));
  checkCancelled(signal);

  const resolvedName =
    input.firstName || input.lastName
      ? `${input.firstName?.trim() || currentFirstName} ${input.lastName?.trim() || currentLastName}`.trim()
      : undefined;

  const niipPrevious = await applyNIIPSwap(niipPage, input, resolvedName);
  task.previousData = { ...task.previousData, ...Object.fromEntries(Object.entries(niipPrevious).map(([key, value]) => [`niip_${key}`, value])) };
  addStep(task, createStep('niip', `NIIP swap updated fields: ${Object.keys(updates).join(', ')}${resolvedName ? ', name' : ''}`, 'success'));
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
