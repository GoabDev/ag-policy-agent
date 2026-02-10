"use client";

import React, { useEffect, useState } from "react";
import { Header } from "./Header";
import { CorrectionForm } from "./CorrectionForm";
import { LiveActivity } from "./LiveActivity";
import { HistoryTable } from "./HistoryTable";
import { SessionControl } from "./SessionControl";
import { useSSE } from "@/hooks/useSSE";
import { checkBrowser, getVehicleData } from "@/service/api";
import { useQueryClient } from "@tanstack/react-query";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";

export default function DashboardContent() {
  const { logs, setLogs, tasks, activeTasks, isRunning, addLog } = useSSE();

  const [chromeMissing, setChromeStatus] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    checkBrowser()
      .then((res) => {
        if (!res.data?.data?.installed) {
          setChromeStatus(true);
        }
      })
      .catch(() => {});

    // Prefetch vehicle data on dashboard load so it's ready when user needs it
    queryClient.prefetchQuery({
      queryKey: ['vehicle-data'],
      queryFn: getVehicleData,
    });
  }, [queryClient]);

  return (
    <div className="min-h-screen bg-background text-foreground font-sans selection:bg-primary/20">
      <div className="max-w-[1200px] mx-auto p-6 md:p-8">
        <Header />

        {chromeMissing && (
          <Alert className="mb-6 border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-200">
            <AlertTitle className="text-amber-800 dark:text-amber-300 font-semibold">
              Google Chrome not detected
            </AlertTitle>
            <AlertDescription className="text-amber-700/80 dark:text-amber-200/80">
              This application requires Google Chrome to run automations. Please{" "}
              <a
                href="https://www.google.com/chrome/"
                target="_blank"
                rel="noopener noreferrer"
                className="underline text-amber-800 dark:text-amber-300 hover:text-amber-600 dark:hover:text-amber-100"
              >
                download and install Chrome
              </a>
              , then restart the application.
            </AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          <div className="space-y-8">
            <CorrectionForm
              isRunning={isRunning}
              activeTasks={activeTasks}
              tasks={tasks}
            />
          </div>

          <div className="space-y-8">
            <LiveActivity logs={logs} setLogs={setLogs} />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <HistoryTable />
          <SessionControl addLog={addLog} />
        </div>

        <footer className="mt-16 text-center text-muted-foreground text-[10px] tracking-widest uppercase font-bold">
          A&G Insurance — Policy Agent v1.0 • Built with Next.js & Shadcn/UI
        </footer>
      </div>
    </div>
  );
}
