// ============================================
// Correction Types
// ============================================

export type CorrectionType =
  | "name"
  | "registration"
  | "vehicle_make"
  | "reg_and_chassis"
  | "chassis";

export interface NameCorrectionInput {
  type: "name";
  policyNumber: string;
  firstName: string;
  lastName: string;
}

export interface RegistrationCorrectionInput {
  type: "registration";
  policyNumber: string;
  newRegistrationNumber: string;
}

export interface VehicleMakeCorrectionInput {
  type: "vehicle_make";
  policyNumber: string;
  newVehicleMake: string;
  newVehicleModel: string;
}

export interface RegAndChassisCorrectionInput {
  type: "reg_and_chassis";
  policyNumber: string;
  newRegistrationNumber: string;
  newChassisNumber: string;
}

export interface ChassisCorrectionInput {
  type: "chassis";
  policyNumber: string;
  newChassisNumber: string;
}

export type CorrectionInput =
  | NameCorrectionInput
  | RegistrationCorrectionInput
  | VehicleMakeCorrectionInput
  | RegAndChassisCorrectionInput
  | ChassisCorrectionInput;

// ============================================
// Task & Status
// ============================================

export type TaskStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

export interface TaskStep {
  timestamp: string;
  site: "ag" | "niid";
  action: string;
  status: "success" | "failed" | "skipped";
  details?: string;
  screenshot?: string;
}

export interface Task {
  id: string;
  correction: CorrectionInput;
  status: TaskStatus;
  steps: TaskStep[];
  previousData?: Record<string, string>;
  newData?: Record<string, string>;
  createdAt: string;
  completedAt?: string;
  error?: string;
}

// ============================================
// Session
// ============================================

export type SiteName =
  | "ag"
  | "niid"
  | "ag_push"
  | "niid_push"
  | "ag_auto_push"
  | "niid_auto_push";

export interface SessionStatus {
  site: SiteName;
  isActive: boolean;
  lastActivity?: string;
  expiresAt?: string;
}

// ============================================
// API
// ============================================

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface AgentStatus {
  isRunning: boolean;
  runningTasks: Task[];
  workerPool: WorkerPoolStatus;
  sessions: {
    ag: SessionStatus;
    ag_push: SessionStatus;
    niid: SessionStatus;
    niid_push: SessionStatus;
    ag_auto_push: SessionStatus;
    niid_auto_push: SessionStatus;
  };
  uptime: number;
}

// ============================================
// Worker Pool
// ============================================

export interface Worker {
  id: string;
  contexts: Map<SiteName, import("playwright").BrowserContext>;
  pages: Map<SiteName, import("playwright").Page>;
  busy: boolean;
}

export interface WorkerPoolStatus {
  total: number;
  busy: number;
  available: number;
  maxWorkers: number;
  queueLength: number;
}

// ============================================
// SSE Events
// ============================================

export type SSEEventType =
  | "task:started"
  | "task:step"
  | "task:completed"
  | "task:failed"
  | "push:started"
  | "push:step"
  | "push:completed"
  | "push:failed"
  | "push:uploading"
  | "task:cancelled"
  | "push:cancelled"
  | "session:status"
  | "session:login_required"
  | "session:login_failed"
  | "automated:status"
  | "automated:run"
  | "keepalive:ping"
  | "log";

export interface SSEEvent {
  type: SSEEventType;
  data: any;
  timestamp: string;
}

// ============================================
// Policy Push Types
// ============================================

export interface PolicyPushByNumber {
  method: "policy_number";
  policyNumber: string;
}

export interface PolicyPushByDateRange {
  method: "date_range";
  fromDate: string; // Format: DD-MMM-YYYY e.g. "01-Feb-2026"
  toDate: string;
}

export type PolicyPushInput = PolicyPushByNumber | PolicyPushByDateRange;

export type PolicyPushStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

export interface PolicyPushStep {
  timestamp: string;
  site: "ag" | "ag_push" | "niid_push" | "ag_auto_push" | "niid_auto_push";
  action: string;
  status: "success" | "failed" | "skipped";
  details?: string;
}

export interface PolicyPushTask {
  id: string;
  input: PolicyPushInput;
  source?: "manual" | "automated";
  automationRunId?: string;
  automationMode?: AutomatedAgentMode;
  status: PolicyPushStatus;
  steps: PolicyPushStep[];
  createdAt: string;
  completedAt?: string;
  error?: string;
  downloadedFile?: string;
  uploadResult?: string;
  uploadHasResults?: boolean;
}

// ============================================
// Automated Policy Agent Types
// ============================================

export type AutomatedAgentMode = "current_day" | "year_to_date";
export type AutomatedAgentStatus =
  | "idle"
  | "running"
  | "stopping"
  | "completed"
  | "failed"
  | "requires_login";

export interface AutomatedAgentRun {
  id: string;
  mode: AutomatedAgentMode;
  fromDate: string;
  toDate: string;
  status: PolicyPushStatus;
  attempt: number;
  createdAt: string;
  completedAt?: string;
  error?: string;
  policyPushTaskId?: string;
}

export interface AutomatedAgentState {
  mode: AutomatedAgentMode | null;
  status: AutomatedAgentStatus;
  startedAt?: string;
  stoppedAt?: string;
  message?: string;
  currentRun?: AutomatedAgentRun;
  runs: AutomatedAgentRun[];
  yearToDate: {
    year?: number;
    nextDate?: string;
    endDate?: string;
    completedBatches: number;
    failedBatches: number;
  };
}

// ============================================
// User Settings (persisted to settings.json)
// ============================================

export interface UserSettings {
  headless: boolean;
  logRetentionDays: number;
  autoStartSessions: boolean;
  sessionTimeoutHours: number;
  maxWorkers: number;
  agKeepAliveMinutes: number;
  niidKeepAliveMinutes: number;
  notifications: "all" | "errors" | "none";
  automatedAgentPassword?: string;
}

export interface Config {
  ag: {
    url: string;
    spoolUrl: string;
    username: string;
    password: string;
    sessionPath: string;
  };
  niid: {
    url: string;
    policyCorrectionUrl: string;
    username: string;
    password: string;
    sessionPath: string;
  };
  niidPush: {
    url: string;
    uploadUrl: string;
    username: string;
    password: string;
    sessionPath: string;
  };
  automatedPush: {
    agSessionPath: string;
    niidSessionPath: string;
  };
  port: number;
  keepAliveInterval: number;
  niidKeepAliveInterval: number;
  sessionInactivityTimeout: number;
  maxWorkers: number;
  headless: boolean;
  storagePath: string;
  logsPath: string;
  automatedLogsPath: string;
  dashboardPath: string;
  automatedAgentEmails: string[];
  automatedAgentPassword: string;
}
