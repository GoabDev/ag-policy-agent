import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
    },
  });
}

export function usePushPolicy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.pushPolicy,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['push-logs'] });
    },
  });
}

export function usePushLogs() {
  return useQuery({
    queryKey: ['push-logs'],
    queryFn: api.getPushLogs,
  });
}
