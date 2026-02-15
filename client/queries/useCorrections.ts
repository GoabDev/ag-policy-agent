import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { sileo } from 'sileo';
import * as api from '@/service/api';

export function useLogs() {
  return useQuery({
    queryKey: ['logs'],
    queryFn: api.getLogs,
  });
}

export function useRunCorrection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.runCorrection,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['logs'] });
      sileo.success({ title: 'Correction task queued' });
    },
    onError: (error: Error) => {
      sileo.error({ title: 'Correction failed', description: error.message || 'Something went wrong' });
    },
  });
}

export function useCancelCorrection() {
  return useMutation({
    mutationFn: api.cancelCorrection,
    onError: (error: Error) => {
      sileo.error({ title: 'Failed to cancel', description: error.message || 'Something went wrong' });
    },
  });
}

export function useCancelPolicyPush() {
  return useMutation({
    mutationFn: api.cancelPolicyPush,
    onError: (error: Error) => {
      sileo.error({ title: 'Failed to cancel', description: error.message || 'Something went wrong' });
    },
  });
}

export function usePushPolicy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.pushPolicy,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['push-logs'] });
      sileo.success({ title: 'Policy push task queued' });
    },
    onError: (error: Error) => {
      sileo.error({ title: 'Policy push failed', description: error.message || 'Something went wrong' });
    },
  });
}

export function usePushLogs() {
  return useQuery({
    queryKey: ['push-logs'],
    queryFn: api.getPushLogs,
  });
}
