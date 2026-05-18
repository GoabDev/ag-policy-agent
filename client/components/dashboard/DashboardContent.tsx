"use client";

import React, { useEffect } from "react";
import { Header } from "./Header";
import { CorrectionForm } from "./CorrectionForm";
import { PolicyPushForm } from "./PolicyPushForm";
import { PolicyStatusForm } from "./PolicyStatusForm";
import { LiveActivity } from "./LiveActivity";
import { HistoryTable } from "./HistoryTable";
import { SessionControl } from "./SessionControl";
import { useSSE } from "@/hooks/useSSE";
import { getVehicleData } from "@/service/api";
import { useQueryClient } from "@tanstack/react-query";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import {
  createCorrectionRetryDraft,
  takeCorrectionRetryDraft,
  type CorrectionRetryDraft,
} from "@/lib/correction-retry";

export default function DashboardContent() {
  const { logs, setLogs, tasks, activeTasks, isRunning, policyStatusTasks } = useSSE();
  const [correctionRetryDraft, setCorrectionRetryDraft] =
    React.useState<CorrectionRetryDraft | null>(null);

  const queryClient = useQueryClient();

  useEffect(() => {
    queryClient.prefetchQuery({
      queryKey: ["vehicle-data"],
      queryFn: getVehicleData,
    });
  }, [queryClient]);

  useEffect(() => {
    const draft = takeCorrectionRetryDraft();
    if (draft) {
      setCorrectionRetryDraft(draft);
    }
  }, []);

  const retryCorrection = React.useCallback((correction: Record<string, any>) => {
    setCorrectionRetryDraft(createCorrectionRetryDraft(correction));
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground font-sans selection:bg-primary/20">
      <div className="max-w-[1200px] mx-auto p-6 md:p-8">
        <Header />

        <Alert className="mb-6 border-blue-500/50 bg-blue-500/10 text-blue-700 dark:text-blue-200">
          <AlertTitle className="text-blue-800 dark:text-blue-300 font-semibold">
            Google Chrome Required
          </AlertTitle>
          <AlertDescription className="text-blue-700/80 dark:text-blue-200/80">
            This application uses Google Chrome to run automations. Please
            ensure Chrome is installed on your system.{" "}
            <a
              href="https://www.google.com/chrome/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline text-blue-800 dark:text-blue-300 hover:text-blue-600 dark:hover:text-blue-100"
            >
              Download Chrome
            </a>
          </AlertDescription>
        </Alert>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          <CorrectionForm
            isRunning={isRunning}
            activeTasks={activeTasks}
            tasks={tasks}
            retryDraft={correctionRetryDraft}
          />
          <PolicyPushForm activeTasks={activeTasks} tasks={tasks} />
        </div>

        <div className="mb-8">
          <PolicyStatusForm policyStatusTasks={policyStatusTasks} />
        </div>

        <div className="mb-8">
          <LiveActivity logs={logs} setLogs={setLogs} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <HistoryTable onRetryCorrection={retryCorrection} />
          <SessionControl />
        </div>

        <footer className="mt-16 text-center text-muted-foreground text-[10px] tracking-widest uppercase font-bold">
          A&G Insurance - Policy Agent v2.4.0
        </footer>
      </div>
    </div>
  );
}
