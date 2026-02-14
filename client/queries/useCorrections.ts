import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
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
      toast.success('Correction task queued');
    },
    onError: (error: Error) => {
      toast.error('Correction failed', {
        description: error.message || 'Something went wrong',
      });
    },
  });
}

export function useCancelCorrection() {
  return useMutation({
    mutationFn: api.cancelCorrection,
    onError: (error: Error) => {
      toast.error('Failed to cancel', {
        description: error.message || 'Something went wrong',
      });
    },
  });
}

export function useCancelPolicyPush() {
  return useMutation({
    mutationFn: api.cancelPolicyPush,
    onError: (error: Error) => {
      toast.error('Failed to cancel', {
        description: error.message || 'Something went wrong',
      });
    },
  });
}

export function usePushPolicy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.pushPolicy,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['push-logs'] });
      toast.success('Policy push task queued');
    },
    onError: (error: Error) => {
      toast.error('Policy push failed', {
        description: error.message || 'Something went wrong',
      });
    },
  });
}

export function usePushLogs() {
  return useQuery({
    queryKey: ['push-logs'],
    queryFn: api.getPushLogs,
  });
}
