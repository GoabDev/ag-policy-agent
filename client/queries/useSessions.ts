import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { sileo } from 'sileo';
import * as api from '@/service/api';

export function useStatus() {
  return useQuery({
    queryKey: ['status'],
    queryFn: api.getStatus,
    refetchInterval: 10000, // Poll every 10s as a fallback
  });
}

export function useLoginAG() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.loginAG,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['status'] });
      sileo.success({ title: 'A&G login initiated' });
    },
    onError: (error: Error) => {
      sileo.error({ title: 'A&G login failed', description: error.message || 'Something went wrong' });
    },
  });
}

export function useLoginEPIN() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.loginEPIN,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['status'] });
      sileo.success({ title: 'E-PIN login initiated' });
    },
    onError: (error: Error) => {
      sileo.error({ title: 'E-PIN login failed', description: error.message || 'Something went wrong' });
    },
  });
}

export function useLoginNIID() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.loginNIID,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['status'] });
      sileo.success({ title: 'NIID login popup opened', description: 'Complete login in the browser window' });
    },
    onError: (error: Error) => {
      sileo.error({ title: 'NIID login failed', description: error.message || 'Something went wrong' });
    },
  });
}

export function useLoginNIIDPush() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.loginNIIDPush,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['status'] });
      sileo.success({ title: 'NIID Push login popup opened', description: 'Complete login in the browser window' });
    },
    onError: (error: Error) => {
      sileo.error({ title: 'NIID Push login failed', description: error.message || 'Something went wrong' });
    },
  });
}

export function useLoginNIIDAll() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.loginNIIDAll,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['status'] });
      sileo.success({ title: 'Both NIID login popups opened', description: 'Complete login in both browser windows' });
    },
    onError: (error: Error) => {
      sileo.error({ title: 'NIID login failed', description: error.message || 'Something went wrong' });
    },
  });
}

export function useLoginAutomatedPushSessions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.loginAutomatedPushSessions,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['status'] });
      queryClient.invalidateQueries({ queryKey: ['automated-agent-status'] });
      sileo.success({
        title: 'Automated push login started',
        description: 'Complete NIID login in the browser window',
      });
    },
    onError: (error: Error) => {
      sileo.error({ title: 'Automated push login failed', description: error.message || 'Something went wrong' });
    },
  });
}

export function useLoginNIIP() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.loginNIIP,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['status'] });
      sileo.success({ title: 'NIIP login initiated' });
    },
    onError: (error: Error) => {
      sileo.error({ title: 'NIIP login failed', description: error.message || 'Something went wrong' });
    },
  });
}

export function useLoginEPINAll() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.loginEPINAll,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['status'] });
      sileo.success({ title: 'E-PIN and NIIP login initiated' });
    },
    onError: (error: Error) => {
      sileo.error({ title: 'E-PIN / NIIP login failed', description: error.message || 'Something went wrong' });
    },
  });
}

export function useLoginAutomatedNIIDPush() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.loginAutomatedNIIDPush,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['status'] });
      queryClient.invalidateQueries({ queryKey: ['automated-agent-status'] });
      sileo.success({
        title: 'Automated NIID Push login popup opened',
        description: 'Complete login in the browser window',
      });
    },
    onError: (error: Error) => {
      sileo.error({ title: 'Automated NIID Push login failed', description: error.message || 'Something went wrong' });
    },
  });
}

export function useKeepAlive() {
  return useMutation({
    mutationFn: api.startKeepAlive,
    onSuccess: () => {
      sileo.success({ title: 'Heartbeats started' });
    },
    onError: (error: Error) => {
      sileo.error({ title: 'Failed to start heartbeats', description: error.message || 'Something went wrong' });
    },
  });
}

export function useStopAllSessions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.stopAllSessions,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['status'] });
      queryClient.invalidateQueries({ queryKey: ['automated-agent-status'] });
      sileo.success({ title: 'All sessions stopped', description: 'Browsers were closed and saved sessions were cleared' });
    },
    onError: (error: Error) => {
      sileo.error({ title: 'Failed to stop sessions', description: error.message || 'Something went wrong' });
    },
  });
}

export function useStopSessionGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.stopSessionGroup,
    onSuccess: (_data, group) => {
      queryClient.invalidateQueries({ queryKey: ['status'] });
      const label =
        group === 'ag' ? 'A&G Platform' : group === 'niid' ? 'NIID' : 'E-PIN / NIIP';
      sileo.success({
        title: `${label} sessions stopped`,
        description: 'Browsers were closed and saved sessions were cleared for this group',
      });
    },
    onError: (error: Error) => {
      sileo.error({ title: 'Failed to stop sessions', description: error.message || 'Something went wrong' });
    },
  });
}
