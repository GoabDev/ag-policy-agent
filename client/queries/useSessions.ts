import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
    },
  });
}

export function useLoginNIID() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.loginNIID,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['status'] });
    },
  });
}

export function useKeepAlive() {
  return useMutation({
    mutationFn: api.startKeepAlive,
  });
}
