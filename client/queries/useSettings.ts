import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
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
      toast.success("Settings saved");
    },
    onError: (error: Error) => {
      toast.error("Failed to save settings", {
        description: error.message || "Something went wrong",
      });
    },
  });
}

export function useCleanLogs() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.cleanLogs,
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["log-stats"] });
      toast.success(
        `Cleaned ${data.data?.deleted ?? 0} log files`
      );
    },
    onError: (error: Error) => {
      toast.error("Log cleanup failed", {
        description: error.message || "Something went wrong",
      });
    },
  });
}

export function useLogStats() {
  return useQuery({
    queryKey: ["log-stats"],
    queryFn: api.getLogStats,
  });
}
