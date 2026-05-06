import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { sileo } from 'sileo';
import * as api from '@/service/api';

export function usePolicyStatusLogs() {
  return useQuery({
    queryKey: ['policy-status-logs'],
    queryFn: api.getPolicyStatusLogs,
  });
}

export function useStartPolicyStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: api.startPolicyStatus,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['policy-status-logs'] });
      sileo.success({ title: 'Policy status task queued' });
    },
    onError: (error: Error) => {
      sileo.error({
        title: 'Policy status failed',
        description: error.message || 'Something went wrong',
      });
    },
  });
}

export function useClosePolicyStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: api.closePolicyStatus,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['policy-status-logs'] });
    },
    onError: (error: Error) => {
      sileo.error({
        title: 'Failed to close policy status',
        description: error.message || 'Something went wrong',
      });
    },
  });
}

export function useResetPolicyStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: api.resetPolicyStatus,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['policy-status-logs'] });
      sileo.success({ title: 'Policy push reset started' });
    },
    onError: (error: Error) => {
      sileo.error({
        title: 'Failed to reset policy push',
        description: error.message || 'Something went wrong',
      });
    },
  });
}
