import fs from "fs";
import path from "path";
import { v4 as uuid } from "uuid";
import { config } from "../config";
import {
  AutomatedAgentMode,
  AutomatedAgentRun,
  AutomatedAgentState,
  PolicyPushInput,
  PolicyPushTask,
} from "../types";
import { getSessionStatus } from "../browser/controller";
import { emitEvent, log } from "../utils/logger";
import {
  loadAutomatedRunLogs,
  loadAutomatedRunLogsPage,
  loadAutomatedPolicyPushLogsPage,
  saveAutomatedRunLog,
} from "../utils/automatedRunLogs";
import {
  enqueuePolicyPush,
  getPolicyPushQueueStatus,
  hasWaitingManualPolicyPush,
  isPolicyPushLaneBusy,
} from "./policyPushQueue";

const TEN_MINUTES_MS = 10 * 60 * 1000;
const WAIT_FOR_MANUAL_MS = 5000;
const MAX_RUNS = 200;

const statePath = path.join(config.storagePath, "automated-agent-state.json");

let stopRequested = false;
let currentLoop: Promise<void> | null = null;
let currentTimer: NodeJS.Timeout | null = null;
let currentTimerResolve: (() => void) | null = null;

const initialState: AutomatedAgentState = {
  mode: null,
  status: "idle",
  runs: [],
  yearToDate: {
    completedBatches: 0,
    failedBatches: 0,
  },
};

let state: AutomatedAgentState = loadState();

function loadState(): AutomatedAgentState {
  try {
    if (!fs.existsSync(statePath)) return { ...initialState };
    const parsed = JSON.parse(fs.readFileSync(statePath, "utf-8"));
    return {
      ...initialState,
      ...parsed,
      status:
        parsed.status === "running" || parsed.status === "stopping"
          ? "idle"
          : parsed.status || "idle",
      mode:
        parsed.status === "running" || parsed.status === "stopping"
          ? null
          : parsed.mode || null,
      currentRun: undefined,
      runs: Array.isArray(parsed.runs) ? parsed.runs.slice(0, MAX_RUNS) : [],
      yearToDate: {
        ...initialState.yearToDate,
        ...(parsed.yearToDate || {}),
      },
    };
  } catch (err: any) {
    log(`Failed to load automated agent state: ${err.message}`, "error");
    return { ...initialState };
  }
}

function saveState() {
  try {
    if (!fs.existsSync(config.storagePath)) {
      fs.mkdirSync(config.storagePath, { recursive: true });
    }
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2), "utf-8");
  } catch (err: any) {
    log(`Failed to save automated agent state: ${err.message}`, "error");
  }
}

function publishStatus() {
  emitEvent("automated:status", getAutomatedAgentStatus());
  saveState();
}

function setState(partial: Partial<AutomatedAgentState>) {
  state = { ...state, ...partial };
  publishStatus();
}

function addRun(run: AutomatedAgentRun) {
  state.runs = [run, ...state.runs.filter((item) => item.id !== run.id)].slice(
    0,
    MAX_RUNS,
  );
  state.currentRun = run.status === "running" ? run : state.currentRun;
  saveAutomatedRunLog(run);
  emitEvent("automated:run", run);
  publishStatus();
}

function completeRun(run: AutomatedAgentRun, task: PolicyPushTask) {
  const completed: AutomatedAgentRun = {
    ...run,
    status: task.status,
    completedAt: new Date().toISOString(),
    error: task.error,
    policyPushTaskId: task.id,
  };

  state.currentRun = undefined;
  addRun(completed);
  return completed;
}

function failRun(run: AutomatedAgentRun, err: Error) {
  const failed: AutomatedAgentRun = {
    ...run,
    status: "failed",
    completedAt: new Date().toISOString(),
    error: err.message,
  };

  state.currentRun = undefined;
  addRun(failed);
  return failed;
}

function assertSessionsActive(): boolean {
  return (
    getSessionStatus("ag_auto_push").isActive &&
    getSessionStatus("niid_auto_push").isActive
  );
}

function requireSessionsOrStop(): boolean {
  if (assertSessionsActive()) return true;

  setState({
    status: "requires_login",
    mode: null,
    stoppedAt: new Date().toISOString(),
    message: "A&G Automated Push and NIID Automated Push sessions must be active.",
    currentRun: undefined,
  });
  return false;
}

function isSessionFailure(err: Error): boolean {
  const message = err.message.toLowerCase();
  return (
    message.includes("login") ||
    message.includes("session") ||
    message.includes("expired") ||
    message.includes("default.aspx")
  );
}

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    currentTimerResolve = resolve;
    currentTimer = setTimeout(() => {
      currentTimer = null;
      currentTimerResolve = null;
      resolve();
    }, ms);
  });
}

function localDateOnly(date = new Date()): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function compareDate(a: Date, b: Date): number {
  return localDateOnly(a).getTime() - localDateOnly(b).getTime();
}

function formatPolicyDate(date: Date): string {
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${String(date.getDate()).padStart(2, "0")}-${months[date.getMonth()]}-${date.getFullYear()}`;
}

function parsePolicyDate(value?: string): Date | null {
  if (!value) return null;
  const match = value.match(/^(\d{2})-([A-Za-z]{3})-(\d{4})$/);
  if (!match) return null;

  const months = [
    "jan",
    "feb",
    "mar",
    "apr",
    "may",
    "jun",
    "jul",
    "aug",
    "sep",
    "oct",
    "nov",
    "dec",
  ];
  const day = Number(match[1]);
  const month = months.indexOf(match[2].toLowerCase());
  const year = Number(match[3]);
  if (month < 0) return null;
  return new Date(year, month, day);
}

function makeDateRangeInput(from: Date, to: Date): PolicyPushInput {
  return {
    method: "date_range",
    fromDate: formatPolicyDate(from),
    toDate: formatPolicyDate(to),
  };
}

async function runAutomatedPushWithRetry(
  mode: AutomatedAgentMode,
  from: Date,
  to: Date,
): Promise<AutomatedAgentRun> {
  let lastRun: AutomatedAgentRun | null = null;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    if (stopRequested) throw new Error("Automated agent stopped");
    if (!requireSessionsOrStop()) throw new Error("Browser session login required");

    const run: AutomatedAgentRun = {
      id: uuid(),
      mode,
      fromDate: formatPolicyDate(from),
      toDate: formatPolicyDate(to),
      status: "running",
      attempt,
      createdAt: new Date().toISOString(),
    };

    lastRun = run;
    addRun(run);

    try {
      const task = await enqueuePolicyPush(
        makeDateRangeInput(from, to),
        "automated",
        "automated",
        {
          source: "automated",
          automationRunId: run.id,
          automationMode: mode,
        },
      );
      const completed = completeRun(run, task);
      if (task.status === "completed") return completed;

      if (task.error && isSessionFailure(new Error(task.error))) {
        throw new Error(task.error);
      }

      if (attempt === 2) return completed;
    } catch (err: any) {
      failRun(run, err);
      if (isSessionFailure(err)) {
        setState({
          status: "requires_login",
          mode: null,
          stoppedAt: new Date().toISOString(),
          message: err.message,
          currentRun: undefined,
        });
        throw err;
      }

      if (attempt === 2) {
        throw err;
      }
    }
  }

  if (!lastRun) throw new Error("Automated push did not start");
  return lastRun;
}

async function currentDayLoop() {
  const startedDay = localDateOnly();

  while (!stopRequested && compareDate(localDateOnly(), startedDay) === 0) {
    if (!requireSessionsOrStop()) return;

    if (isPolicyPushLaneBusy()) {
      log("Current-day automated run skipped because policy push lane is busy", "warn");
    } else {
      const today = localDateOnly();
      try {
        await runAutomatedPushWithRetry("current_day", today, today);
      } catch (err: any) {
        if (state.status === "requires_login" || stopRequested) return;
        log(`Current-day automated run failed after retry: ${err.message}`, "error");
      }
    }

    if (stopRequested) return;
    await delay(TEN_MINUTES_MS);
  }

  if (!stopRequested && state.mode === "current_day") {
    setState({
      status: "completed",
      mode: null,
      stoppedAt: new Date().toISOString(),
      message: "Current day completed.",
      currentRun: undefined,
    });
  }
}

async function waitForManualPriority() {
  while (!stopRequested && hasWaitingManualPolicyPush()) {
    await delay(WAIT_FOR_MANUAL_MS);
  }
}

async function yearToDateLoop(continueFromSaved: boolean) {
  const today = localDateOnly();
  const year = today.getFullYear();
  const savedNext =
    continueFromSaved && state.yearToDate.year === year
      ? parsePolicyDate(state.yearToDate.nextDate)
      : null;
  let cursor = savedNext || new Date(year, 0, 1);

  state.yearToDate = {
    year,
    nextDate: formatPolicyDate(cursor),
    endDate: formatPolicyDate(today),
    completedBatches:
      continueFromSaved && state.yearToDate.year === year
        ? state.yearToDate.completedBatches
        : 0,
    failedBatches:
      continueFromSaved && state.yearToDate.year === year
        ? state.yearToDate.failedBatches
        : 0,
  };
  publishStatus();

  while (!stopRequested && compareDate(cursor, today) <= 0) {
    if (!requireSessionsOrStop()) return;
    await waitForManualPriority();
    if (stopRequested) return;

    const batchEnd = compareDate(addDays(cursor, 1), today) <= 0
      ? addDays(cursor, 1)
      : today;

    try {
      const run = await runAutomatedPushWithRetry("year_to_date", cursor, batchEnd);
      if (run.status === "completed") {
        state.yearToDate.completedBatches += 1;
      } else {
        state.yearToDate.failedBatches += 1;
      }
    } catch (err: any) {
      if (state.status === "requires_login" || stopRequested) return;
      state.yearToDate.failedBatches += 1;
      log(`Year-to-date batch failed after retry: ${err.message}`, "error");
    }

    cursor = addDays(batchEnd, 1);
    state.yearToDate.nextDate = formatPolicyDate(cursor);
    publishStatus();
  }

  if (!stopRequested && state.mode === "year_to_date") {
    setState({
      status: "completed",
      mode: null,
      stoppedAt: new Date().toISOString(),
      message: "Year-to-date automated push completed.",
      currentRun: undefined,
    });
  }
}

function startLoop(mode: AutomatedAgentMode, loop: () => Promise<void>) {
  stopRequested = false;
  setState({
    mode,
    status: "running",
    startedAt: new Date().toISOString(),
    stoppedAt: undefined,
    message: undefined,
    currentRun: undefined,
  });

  currentLoop = loop()
    .catch((err: any) => {
      if (stopRequested || state.status === "requires_login") return;
      setState({
        status: "failed",
        mode: null,
        stoppedAt: new Date().toISOString(),
        message: err.message,
        currentRun: undefined,
      });
    })
    .finally(() => {
      currentLoop = null;
    });
}

export function startCurrentDayAgent() {
  if (currentLoop || state.status === "running" || state.status === "stopping") {
    throw new Error("An automated agent is already running");
  }
  if (!assertSessionsActive()) {
    throw new Error("A&G Automated Push and NIID Automated Push sessions must be active before starting");
  }

  startLoop("current_day", currentDayLoop);
}

export function startYearToDateAgent() {
  if (currentLoop || state.status === "running" || state.status === "stopping") {
    throw new Error("An automated agent is already running");
  }
  if (!assertSessionsActive()) {
    throw new Error("A&G Automated Push and NIID Automated Push sessions must be active before starting");
  }

  startLoop("year_to_date", () => yearToDateLoop(false));
}

export function continueYearToDateAgent() {
  if (currentLoop || state.status === "running" || state.status === "stopping") {
    throw new Error("An automated agent is already running");
  }
  if (!assertSessionsActive()) {
    throw new Error("A&G Automated Push and NIID Automated Push sessions must be active before starting");
  }

  startLoop("year_to_date", () => yearToDateLoop(true));
}

export function stopAutomatedAgent() {
  if (!currentLoop && state.status !== "running") {
    return false;
  }

  stopRequested = true;
  if (currentTimer) {
    clearTimeout(currentTimer);
    currentTimer = null;
    currentTimerResolve?.();
    currentTimerResolve = null;
  }

  setState({
    status: "stopping",
    message: "Stopping automated agent...",
  });

  currentLoop
    ?.finally(() => {
      setState({
        status: "idle",
        mode: null,
        stoppedAt: new Date().toISOString(),
        message: "Automated agent stopped.",
        currentRun: undefined,
      });
    })
    .catch(() => undefined);

  return true;
}

export function getAutomatedAgentStatus() {
  return {
    ...state,
    queue: getPolicyPushQueueStatus(),
    sessions: {
      ag_auto_push: getSessionStatus("ag_auto_push"),
      niid_auto_push: getSessionStatus("niid_auto_push"),
    },
  };
}

export function getAutomatedAgentLogs() {
  return loadAutomatedRunLogs();
}

export function getAutomatedAgentLogsPage(page: number, pageSize: number) {
  return loadAutomatedPolicyPushLogsPage(page, pageSize);
}
