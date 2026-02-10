import { v4 as uuid } from 'uuid';
import {
  CorrectionInput,
  Task,
  TaskStep,
  NameCorrectionInput,
  RegistrationCorrectionInput,
  VehicleMakeCorrectionInput,
} from '../types';
import { log, emitEvent, saveTaskLog } from '../utils/logger';
import { getAGPolicyPage, searchPolicy, correctName, correctRegistration, correctVehicleMake } from '../browser/actions/ag';
import { getNIIDPolicyPage, searchNIIDPolicy, correctNIIDRegistration } from '../browser/actions/niid';

// Task queue
let currentTask: Task | null = null;
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
// Run Correction
// ============================================

export async function runCorrection(input: CorrectionInput): Promise<Task> {
  if (currentTask && currentTask.status === 'running') {
    throw new Error('A task is already running. Please wait for it to complete.');
  }

  const task: Task = {
    id: uuid(),
    correction: input,
    status: 'running',
    steps: [],
    createdAt: new Date().toISOString(),
  };

  currentTask = task;
  emitEvent('task:started', { taskId: task.id, type: input.type });
  log(`🚀 Starting correction task: ${task.id} (${input.type})`);

  try {
    switch (input.type) {
      case 'name':
        await runNameCorrection(task, input);
        break;
      case 'registration':
        await runRegistrationCorrection(task, input);
        break;
      case 'vehicle_make':
        await runVehicleMakeCorrection(task, input);
        break;
      default:
        throw new Error(`Unknown correction type: ${(input as any).type}`);
    }

    task.status = 'completed';
    task.completedAt = new Date().toISOString();
    emitEvent('task:completed', { taskId: task.id });
    log(`✅ Task completed: ${task.id}`);
  } catch (err: any) {
    task.status = 'failed';
    task.error = err.message;
    task.completedAt = new Date().toISOString();
    addStep(task, createStep('ag', 'error', 'failed', err.message));
    emitEvent('task:failed', { taskId: task.id, error: err.message });
    log(`❌ Task failed: ${task.id} — ${err.message}`, 'error');
  }

  // Save to history
  taskHistory.unshift(task);
  saveTaskLog(task.id, task);
  currentTask = null;

  return task;
}

// ============================================
// Name Correction (A&G only)
// ============================================

async function runNameCorrection(task: Task, input: NameCorrectionInput) {
  // Step 1: Get A&G page (reuses keep-alive session)
  const page = await getAGPolicyPage();
  addStep(task, createStep('ag', 'A&G session ready', 'success'));

  // Step 2: Search for policy
  await searchPolicy(page, input.policyNumber);
  addStep(task, createStep('ag', `Search policy: ${input.policyNumber}`, 'success'));

  // Step 3: Correct name
  await correctName(page, input.firstName, input.lastName);
  addStep(task, createStep('ag', `Name updated to: ${input.firstName} ${input.lastName}`, 'success'));

  // NIID not needed
  addStep(task, createStep('niid', 'NIID update not required for name correction', 'skipped'));
}

// ============================================
// Registration Correction (Both sites)
// ============================================

async function runRegistrationCorrection(task: Task, input: RegistrationCorrectionInput) {
  // Step 1: Get A&G page (reuses keep-alive session)
  const agPage = await getAGPolicyPage();
  addStep(task, createStep('ag', 'A&G session ready', 'success'));

  // Step 2: Search for policy on A&G
  await searchPolicy(agPage, input.policyNumber);
  addStep(task, createStep('ag', `Search policy: ${input.policyNumber}`, 'success'));

  // Step 3: Correct reg on A&G and get old reg number
  const oldRegNumber = await correctRegistration(agPage, input.newRegistrationNumber);
  addStep(task, createStep('ag', `Registration updated (old: ${oldRegNumber} → new: ${input.newRegistrationNumber})`, 'success'));

  // Step 4: Get NIID page (reuses keep-alive session)
  const niidPage = await getNIIDPolicyPage();
  addStep(task, createStep('niid', 'NIID session ready', 'success'));

  // Step 5: Search on NIID using policy number + old reg
  await searchNIIDPolicy(niidPage, input.policyNumber, oldRegNumber);
  addStep(task, createStep('niid', `NIID search: policy ${input.policyNumber} + reg ${oldRegNumber}`, 'success'));

  // Step 6: Correct reg on NIID
  await correctNIIDRegistration(niidPage, input.newRegistrationNumber);
  addStep(task, createStep('niid', `NIID registration updated to: ${input.newRegistrationNumber}`, 'success'));
}

// ============================================
// Vehicle Make Correction (A&G only)
// ============================================

async function runVehicleMakeCorrection(task: Task, input: VehicleMakeCorrectionInput) {
  // Step 1: Get A&G page (reuses keep-alive session)
  const page = await getAGPolicyPage();
  addStep(task, createStep('ag', 'A&G session ready', 'success'));

  // Step 2: Search for policy
  await searchPolicy(page, input.policyNumber);
  addStep(task, createStep('ag', `Search policy: ${input.policyNumber}`, 'success'));

  // Step 3: Correct vehicle make
  await correctVehicleMake(page, input.newVehicleMake, input.newVehicleModel);
  addStep(task, createStep('ag', `Vehicle updated to: ${input.newVehicleMake} ${input.newVehicleModel}`, 'success'));

  // NIID not needed
  addStep(task, createStep('niid', 'NIID update not required for vehicle make correction', 'skipped'));
}

// ============================================
// Getters
// ============================================

export function getCurrentTask(): Task | null {
  return currentTask;
}

export function getTaskHistory(): Task[] {
  return taskHistory;
}