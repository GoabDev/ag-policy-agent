import fs from "fs";
import path from "path";
import { config } from "../config";
import { AutomatedAgentRun, PolicyPushTask } from "../types";
import { loadTaskLogs } from "./logger";

function ensureAutomatedLogsDir() {
  if (!fs.existsSync(config.automatedLogsPath)) {
    fs.mkdirSync(config.automatedLogsPath, { recursive: true });
  }
}

function safeFileName(id: string) {
  return id.replace(/[^a-zA-Z0-9_-]/g, "_");
}

export function saveAutomatedRunLog(run: AutomatedAgentRun) {
  try {
    ensureAutomatedLogsDir();
    const filePath = path.join(config.automatedLogsPath, `${safeFileName(run.id)}.json`);
    fs.writeFileSync(filePath, JSON.stringify(run, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to save automated run log:", err);
  }
}

export function loadAutomatedRunLogs(): AutomatedAgentRun[] {
  try {
    if (!fs.existsSync(config.automatedLogsPath)) return [];

    return fs
      .readdirSync(config.automatedLogsPath)
      .filter((file) => file.endsWith(".json"))
      .map((file) => {
        try {
          return JSON.parse(
            fs.readFileSync(path.join(config.automatedLogsPath, file), "utf-8"),
          ) as AutomatedAgentRun;
        } catch {
          return null;
        }
      })
      .filter((run): run is AutomatedAgentRun => Boolean(run))
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
  } catch {
    return [];
  }
}

export function loadAutomatedRunLogsPage(page: number, pageSize: number) {
  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const safePageSize =
    Number.isFinite(pageSize) && pageSize > 0
      ? Math.min(Math.floor(pageSize), 100)
      : 20;
  const allLogs = loadAutomatedRunLogs();
  const total = allLogs.length;
  const totalPages = Math.max(1, Math.ceil(total / safePageSize));
  const normalizedPage = Math.min(safePage, totalPages);
  const start = (normalizedPage - 1) * safePageSize;

  return {
    items: allLogs.slice(start, start + safePageSize),
    pagination: {
      page: normalizedPage,
      pageSize: safePageSize,
      total,
      totalPages,
      hasNextPage: normalizedPage < totalPages,
      hasPreviousPage: normalizedPage > 1,
    },
  };
}

function paginate<T>(items: T[], page: number, pageSize: number) {
  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const safePageSize =
    Number.isFinite(pageSize) && pageSize > 0
      ? Math.min(Math.floor(pageSize), 100)
      : 20;
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / safePageSize));
  const normalizedPage = Math.min(safePage, totalPages);
  const start = (normalizedPage - 1) * safePageSize;

  return {
    items: items.slice(start, start + safePageSize),
    pagination: {
      page: normalizedPage,
      pageSize: safePageSize,
      total,
      totalPages,
      hasNextPage: normalizedPage < totalPages,
      hasPreviousPage: normalizedPage > 1,
    },
  };
}

export function loadAutomatedPolicyPushLogsPage(
  page: number,
  pageSize: number,
) {
  const automatedPushLogs = loadTaskLogs()
    .filter((task): task is PolicyPushTask => {
      const pushTask = task as PolicyPushTask;
      return Boolean(pushTask.input && pushTask.source === "automated");
    })
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

  return paginate(automatedPushLogs, page, pageSize);
}
