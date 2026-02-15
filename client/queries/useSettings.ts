import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { sileo } from "sileo";
import * as api from "@/service/api";

export function useSettings() {
  return useQuery({
    queryKey: ["settings"],
    queryFn: api.getSettingsApi,
  });
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.updateSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      sileo.success({ title: "Settings saved" });
    },
    onError: (error: Error) => {
      sileo.error({ title: "Failed to save settings", description: error.message || "Something went wrong" });
    },
  });
}

export function useCleanLogs() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.cleanLogs,
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["log-stats"] });
      sileo.success({ title: `Cleaned ${data.data?.deleted ?? 0} log files` });
    },
    onError: (error: Error) => {
      sileo.error({ title: "Log cleanup failed", description: error.message || "Something went wrong" });
    },
  });
}

export function useLogStats() {
  return useQuery({
    queryKey: ["log-stats"],
    queryFn: api.getLogStats,
  });
}
