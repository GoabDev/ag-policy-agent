import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { sileo } from 'sileo';
import * as api from '@/service/api';

const TOKEN_KEY = 'automated-agent-token';

interface AutomatedAgentLoginResponse {
  data?: {
    token?: string;
  };
}

export function getStoredAutomatedAgentToken() {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem(TOKEN_KEY) || '';
}

export function storeAutomatedAgentToken(token: string) {
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearAutomatedAgentToken() {
  window.localStorage.removeItem(TOKEN_KEY);
}

export function useAutomatedAgentLogin() {
  return useMutation({
    mutationFn: api.loginAutomatedAgent,
    onSuccess: (response: AutomatedAgentLoginResponse) => {
      const token = response?.data?.token;
      if (token) storeAutomatedAgentToken(token);
      sileo.success({ title: 'Automated Agent unlocked' });
    },
    onError: (error: Error) => {
      sileo.error({ title: 'Automated Agent login failed', description: error.message });
    },
  });
}

export function useAutomatedAgentStatus(token: string) {
  return useQuery({
    queryKey: ['automated-agent-status', token],
    queryFn: () => api.getAutomatedAgentStatus(token),
    enabled: Boolean(token),
    refetchInterval: 5000,
    retry: false,
  });
}

export function useAutomatedAgentLogs(
  token: string,
  params: { page?: number; pageSize?: number } = {},
) {
  const page = params.page || 1;
  const pageSize = params.pageSize || 20;

  return useQuery({
    queryKey: ['automated-agent-logs', token, page, pageSize],
    queryFn: () => api.getAutomatedAgentLogs(token, { page, pageSize }),
    enabled: Boolean(token),
    refetchInterval: 5000,
    retry: false,
  });
}

export function useStartCurrentDayAgent(token: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.startCurrentDayAutomatedAgent(token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automated-agent-status'] });
      queryClient.invalidateQueries({ queryKey: ['automated-agent-logs'] });
      sileo.success({ title: 'Current-day agent started' });
    },
    onError: (error: Error) => {
      sileo.error({ title: 'Could not start agent', description: error.message });
    },
  });
}

export function useStartYearToDateAgent(token: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.startYearToDateAutomatedAgent(token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automated-agent-status'] });
      queryClient.invalidateQueries({ queryKey: ['automated-agent-logs'] });
      sileo.success({ title: 'Year-to-date agent started' });
    },
    onError: (error: Error) => {
      sileo.error({ title: 'Could not start agent', description: error.message });
    },
  });
}

export function useContinueYearToDateAgent(token: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.continueYearToDateAutomatedAgent(token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automated-agent-status'] });
      queryClient.invalidateQueries({ queryKey: ['automated-agent-logs'] });
      sileo.success({ title: 'Year-to-date agent continued' });
    },
    onError: (error: Error) => {
      sileo.error({ title: 'Could not continue agent', description: error.message });
    },
  });
}

export function useStopAutomatedAgent(token: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.stopAutomatedAgent(token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automated-agent-status'] });
      queryClient.invalidateQueries({ queryKey: ['automated-agent-logs'] });
      sileo.success({ title: 'Stop requested' });
    },
    onError: (error: Error) => {
      sileo.error({ title: 'Could not stop agent', description: error.message });
    },
  });
}
