// ============================================
// Correction Types
// ============================================

export type CorrectionType = 'name' | 'registration' | 'vehicle_make';

export interface NameCorrectionInput {
  type: 'name';
  policyNumber: string;
  firstName: string;
  lastName: string;
}

export interface RegistrationCorrectionInput {
  type: 'registration';
  policyNumber: string;
  newRegistrationNumber: string;
}

export interface VehicleMakeCorrectionInput {
  type: 'vehicle_make';
  policyNumber: string;
  newVehicleMake: string;
  newVehicleModel: string;
}

export type CorrectionInput =
  | NameCorrectionInput
  | RegistrationCorrectionInput
  | VehicleMakeCorrectionInput;

// ============================================
// Task & Status
// ============================================

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface TaskStep {
  timestamp: string;
  site: 'ag' | 'niid';
  action: string;
  status: 'success' | 'failed' | 'skipped';
  details?: string;
  screenshot?: string;
}

export interface Task {
  id: string;
  correction: CorrectionInput;
  status: TaskStatus;
  steps: TaskStep[];
  createdAt: string;
  completedAt?: string;
  error?: string;
}

// ============================================
// Session
// ============================================

export type SiteName = 'ag' | 'niid';

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
    niid: SessionStatus;
  };
  uptime: number;
}

// ============================================
// Worker Pool
// ============================================

export interface Worker {
  id: string;
  contexts: Map<SiteName, import('playwright').BrowserContext>;
  pages: Map<SiteName, import('playwright').Page>;
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
  | 'task:started'
  | 'task:step'
  | 'task:completed'
  | 'task:failed'
  | 'session:status'
  | 'session:login_required'
  | 'session:login_failed'
  | 'keepalive:ping'
  | 'log';

export interface SSEEvent {
  type: SSEEventType;
  data: any;
  timestamp: string;
}

export interface Config {
  ag: {
    url: string;
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
  port: number;
  keepAliveInterval: number;
  niidKeepAliveInterval: number;
  maxWorkers: number;
  headless: boolean;
  storagePath: string;
  logsPath: string;
  dashboardPath: string;
}
