"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Loader2,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  AutomatedAgentRun,
  AutomatedRunDialog,
} from "@/components/automated-agent/AutomationRunDetails";
import {
  clearAutomatedAgentToken,
  getStoredAutomatedAgentToken,
  useAutomatedAgentLogs,
  useAutomatedAgentStatus,
} from "@/queries/useAutomatedAgent";

function RunStatusIcon({ status }: { status: string }) {
  if (status === "completed") return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
  if (status === "failed" || status === "cancelled") return <XCircle className="h-4 w-4 text-destructive" />;
  return <Clock className="h-4 w-4 text-amber-500" />;
}

function getRunLabel(run: AutomatedAgentRun) {
  if (run.input?.method === "date_range") {
    return `${run.input?.fromDate} to ${run.input?.toDate}`;
  }
  return run.input?.policyNumber || "-";
}

export default function AutomatedAgentLogsPage() {
  const router = useRouter();
  const [token] = useState(() => getStoredAutomatedAgentToken());
  const [page, setPage] = useState(1);
  const [selectedRun, setSelectedRun] = useState<AutomatedAgentRun | null>(null);
  const pageSize = 20;

  const statusQuery = useAutomatedAgentStatus(token);
  const logsQuery = useAutomatedAgentLogs(token, { page, pageSize });
  const logs = useMemo<AutomatedAgentRun[]>(
    () => logsQuery.data?.data?.items || [],
    [logsQuery.data?.data],
  );
  const pagination = logsQuery.data?.data?.pagination;
  const tokenRejected = Boolean(statusQuery.error);
  const isValidatingToken = Boolean(token && statusQuery.isLoading);

  if (tokenRejected) {
    clearAutomatedAgentToken();
  }

  if (isValidatingToken) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-6">
          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle>Automation Logs</CardTitle>
              <CardDescription>Checking your Automated Agent session.</CardDescription>
            </CardHeader>
            <CardContent className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Validating access...
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (!token || tokenRejected) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-6">
          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle>Automated Agent Login Required</CardTitle>
              <CardDescription>
                Unlock the Automated Agent page before viewing automation logs.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full" onClick={() => router.push("/automated-agent")}>
                Go to Automated Agent
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-[1200px] p-6 md:p-8">
        <header className="mb-8 flex flex-col gap-4 border-b border-border pb-6 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="flex items-center gap-3 text-2xl font-bold tracking-tight">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <CalendarClock className="h-4 w-4" />
              </span>
              Automation Logs
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Full permanent automation push history, loaded one page at a time.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => router.push("/automated-agent")}>
              Automated Agent
            </Button>
            <Button variant="outline" size="sm" onClick={() => router.push("/dashboard")}>
              Dashboard
            </Button>
            <ThemeToggle />
          </div>
        </header>

        <Card className="rounded-lg">
          <CardHeader>
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle>All Logs</CardTitle>
                <CardDescription>
                  Page {pagination?.page || page} of {pagination?.totalPages || 1}. {pagination?.total || 0} logs stored.
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{pageSize} per page</Badge>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => logsQuery.refetch()}
                  disabled={logsQuery.isFetching}
                >
                  {logsQuery.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clock className="h-4 w-4" />}
                  Refresh
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b text-left text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-4 font-medium">Status</th>
                    <th className="py-2 pr-4 font-medium">Agent</th>
                    <th className="py-2 pr-4 font-medium">Range</th>
                    <th className="py-2 pr-4 font-medium">Steps</th>
                    <th className="py-2 pr-4 font-medium">Created</th>
                    <th className="py-2 font-medium">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.length === 0 && (
                    <tr>
                      <td className="py-6 text-muted-foreground" colSpan={6}>
                        No automated logs found.
                      </td>
                    </tr>
                  )}
                  {logs.map((run) => (
                    <tr
                      key={run.id}
                      className="cursor-pointer border-b border-border/60 transition-colors hover:bg-accent/50"
                      onClick={() => setSelectedRun(run)}
                    >
                      <td className="py-3 pr-4">
                        <span className="flex items-center gap-2 capitalize">
                          <RunStatusIcon status={run.status} />
                          {run.status}
                        </span>
                      </td>
                      <td className="py-3 pr-4 capitalize">{run.automationMode?.replace("_", " ")}</td>
                      <td className="py-3 pr-4">{getRunLabel(run)}</td>
                      <td className="py-3 pr-4">{run.steps?.length || 0}</td>
                      <td className="py-3 pr-4 text-muted-foreground">
                        {run.createdAt ? new Date(run.createdAt).toLocaleString() : "-"}
                      </td>
                      <td className="max-w-[260px] truncate py-3 text-muted-foreground">
                        {run.error || "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex items-center justify-between gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={!pagination?.hasPreviousPage || logsQuery.isFetching}
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {pagination?.page || page} / {pagination?.totalPages || 1}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((current) => current + 1)}
                disabled={!pagination?.hasNextPage || logsQuery.isFetching}
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>

        <AutomatedRunDialog
          run={selectedRun}
          open={Boolean(selectedRun)}
          onOpenChange={(open) => !open && setSelectedRun(null)}
        />
      </div>
    </div>
  );
}
