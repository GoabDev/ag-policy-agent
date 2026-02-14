import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
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
      toast.success('A&G login initiated');
    },
    onError: (error: Error) => {
      toast.error('A&G login failed', {
        description: error.message || 'Something went wrong',
      });
    },
  });
}

export function useLoginNIID() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.loginNIID,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['status'] });
      toast.success('NIID login popup opened', {
        description: 'Complete login in the browser window',
      });
    },
    onError: (error: Error) => {
      toast.error('NIID login failed', {
        description: error.message || 'Something went wrong',
      });
    },
  });
}

export function useLoginNIIDPush() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.loginNIIDPush,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['status'] });
      toast.success('NIID Push login popup opened', {
        description: 'Complete login in the browser window',
      });
    },
    onError: (error: Error) => {
      toast.error('NIID Push login failed', {
        description: error.message || 'Something went wrong',
      });
    },
  });
}

export function useLoginNIIDAll() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.loginNIIDAll,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['status'] });
      toast.success('Both NIID login popups opened', {
        description: 'Complete login in both browser windows',
      });
    },
    onError: (error: Error) => {
      toast.error('NIID login failed', {
        description: error.message || 'Something went wrong',
      });
    },
  });
}

export function useKeepAlive() {
  return useMutation({
    mutationFn: api.startKeepAlive,
    onSuccess: () => {
      toast.success('Heartbeats started');
    },
    onError: (error: Error) => {
      toast.error('Failed to start heartbeats', {
        description: error.message || 'Something went wrong',
      });
    },
  });
}
