import api from './config/axios';

export const getStatus = () => api.get('/api/status');
export const getLogs = () => api.get('/api/corrections/logs');

export const runCorrection = (data: any) => {
  const body: any = { type: data.type, policyNumber: data.policyNumber };
  if (data.type === 'name') body.newName = data.newValue;
  else if (data.type === 'registration') body.newRegistrationNumber = data.newValue;
  else if (data.type === 'vehicle_make') body.newVehicleMake = data.newValue;

  return api.post('/api/corrections/run', body);
};

export const loginAG = () => api.post('/api/sessions/login-ag');
export const startKeepAlive = () => api.post('/api/sessions/keepalive');
