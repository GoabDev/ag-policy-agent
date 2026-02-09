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
