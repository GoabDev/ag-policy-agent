import api from './config/axios';

export const getStatus = () => api.get('/api/status');
export const getLogs = () => api.get('/api/corrections/logs');

export const runCorrection = (data: any) => {
  const body: any = { 
    type: data.type, 
    policyNumber: data.policyNumber 
  };
  
  if (data.type === 'name') {
    body.firstName = data.firstName;
    body.lastName = data.lastName;
  } else if (data.type === 'registration') {
    body.newRegistrationNumber = data.newValue;
  } else if (data.type === 'vehicle_make') {
    body.newVehicleMake = data.newVehicleMake;
    body.newVehicleModel = data.newVehicleModel;
  } else if (data.type === 'reg_and_chassis') {
    body.newRegistrationNumber = data.newRegistrationNumber;
    body.newChassisNumber = data.newChassisNumber;
  } else if (data.type === 'chassis') {
    body.newChassisNumber = data.newChassisNumber;
  }

  return api.post('/api/corrections/run', body);
};

export const getVehicleData = () => api.get('/api/vehicle-data');
export const refreshVehicleData = () => api.get('/api/vehicle-data?refresh=true');
export const loginAG = () => api.post('/api/sessions/login-ag');
export const loginNIID = () => api.post('/api/sessions/login-niid');
export const loginNIIDPush = () => api.post('/api/sessions/login-niid-push');
export const loginNIIDAll = () => api.post('/api/sessions/login-niid-all');
export const loginAutomatedPushSessions = () => api.post('/api/sessions/login-automated-push');
export const loginAutomatedNIIDPush = () => api.post('/api/sessions/login-automated-niid-push');
export const startKeepAlive = () => api.post('/api/sessions/keepalive');
export const stopAllSessions = () => api.post('/api/sessions/stop-all');

// Cancellation
export const cancelCorrection = (taskId: string) => api.post(`/api/corrections/${taskId}/cancel`);
export const cancelPolicyPush = (taskId: string) => api.post(`/api/policy-push/${taskId}/cancel`);

// Policy Push
export const pushPolicy = (data: { method: string; policyNumber?: string; fromDate?: string; toDate?: string }) => {
  return api.post('/api/policy-push/run', data);
};
export const getPushLogs = () => api.get('/api/policy-push/logs');

// Automated Agent
const automatedAgentAuth = (token: string) => ({
  headers: {
    Authorization: `Bearer ${token}`,
  },
});

export const loginAutomatedAgent = (data: { email: string; password: string }) => {
  return api.post('/api/automated-agent/login', data);
};

export const getAutomatedAgentStatus = (token: string) => {
  return api.get('/api/automated-agent/status', automatedAgentAuth(token));
};

export const startCurrentDayAutomatedAgent = (token: string) => {
  return api.post('/api/automated-agent/current-day/start', {}, automatedAgentAuth(token));
};

export const startYearToDateAutomatedAgent = (token: string) => {
  return api.post('/api/automated-agent/year-to-date/start', {}, automatedAgentAuth(token));
};

export const continueYearToDateAutomatedAgent = (token: string) => {
  return api.post('/api/automated-agent/year-to-date/continue', {}, automatedAgentAuth(token));
};

export const stopAutomatedAgent = (token: string) => {
  return api.post('/api/automated-agent/stop', {}, automatedAgentAuth(token));
};

export const getAutomatedAgentLogs = (
  token: string,
  params: { page?: number; pageSize?: number } = {},
) => {
  return api.get('/api/automated-agent/logs', {
    ...automatedAgentAuth(token),
    params,
  });
};

// Settings
export const getSettingsApi = () => api.get('/api/settings');
export const updateSettings = (data: any) => api.put('/api/settings', data);
export const cleanLogs = () => api.post('/api/settings/clean-logs');
export const getLogStats = () => api.get('/api/settings/log-stats');
