"use client";

import React, { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarClock,
  CheckCircle2,
  Clock,
  Loader2,
  LogOut,
  Play,
  Shield,
  Square,
  XCircle,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ThemeToggle } from "@/components/theme-toggle";
import { SessionControl } from "@/components/dashboard/SessionControl";
import {
  AutomatedAgentRun,
  AutomatedRunDialog,
} from "@/components/automated-agent/AutomationRunDetails";
import {
  clearAutomatedAgentToken,
  getStoredAutomatedAgentToken,
  useAutomatedAgentLogin,
  useAutomatedAgentLogs,
  useAutomatedAgentStatus,
  useContinueYearToDateAgent,
  useStartCurrentDayAgent,
  useStartYearToDateAgent,
  useStopAutomatedAgent,
} from "@/queries/useAutomatedAgent";

function StatusBadge({ active, label }: { active: boolean; label: string }) {
  return (
    <Badge
      variant="outline"
      className={
        active
          ? "border-emerald-500/50 text-emerald-600 dark:text-emerald-400"
          : "border-border text-muted-foreground"
      }
    >
      <span
        className={
          active
            ? "h-2 w-2 rounded-full bg-emerald-500"
            : "h-2 w-2 rounded-full bg-muted-foreground/50"
        }
      />
      {label}
    </Badge>
  );
}

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

interface AutomatedAgentLoginResponse {
  data?: {
    token?: string;
  };
}

export default function AutomatedAgentPage() {
  const router = useRouter();
  const [token, setToken] = useState(() => getStoredAutomatedAgentToken());
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [selectedRun, setSelectedRun] = useState<AutomatedAgentRun | null>(null);

  const loginMutation = useAutomatedAgentLogin();
  const statusQuery = useAutomatedAgentStatus(token);
  const logsQuery = useAutomatedAgentLogs(token, { page: 1, pageSize: 20 });
  const startCurrentDay = useStartCurrentDayAgent(token);
  const startYearToDate = useStartYearToDateAgent(token);
  const continueYearToDate = useContinueYearToDateAgent(token);
  const stopAgent = useStopAutomatedAgent(token);

  const status = statusQuery.data?.data;
  const tokenRejected = Boolean(statusQuery.error);
  const isValidatingToken = Boolean(token && statusQuery.isLoading);
  const isRunning = status?.status === "running" || status?.status === "stopping";
  const sessionsReady = Boolean(
    status?.sessions?.ag_auto_push?.isActive &&
      status?.sessions?.niid_auto_push?.isActive,
  );
  const canStart = Boolean(token && sessionsReady && !isRunning);
  const permanentLogs = useMemo<AutomatedAgentRun[]>(
    () => logsQuery.data?.data?.items || [],
    [logsQuery.data?.data],
  );
  const pagination = logsQuery.data?.data?.pagination;
  const visibleLogs = permanentLogs;

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault();
    const response = await loginMutation.mutateAsync({ email, password }) as AutomatedAgentLoginResponse;
    const nextToken = response?.data?.token;
    if (nextToken) {
      setToken(nextToken);
      setPassword("");
    }
  };

  const logout = () => {
    clearAutomatedAgentToken();
    setToken("");
  };

  if (tokenRejected) {
    clearAutomatedAgentToken();
  }

  if (isValidatingToken) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-6">
          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <Shield className="h-5 w-5" />
                Automated Agent
              </CardTitle>
              <CardDescription>
                Checking your Automated Agent session.
              </CardDescription>
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
              <CardTitle className="flex items-center gap-2 text-xl">
                <Shield className="h-5 w-5" />
                Automated Agent
              </CardTitle>
              <CardDescription>
                Sign in to manage unattended policy push agents.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={handleLogin}>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    autoComplete="email"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete="current-password"
                    required
                  />
                </div>
                <Button className="w-full" type="submit" disabled={loginMutation.isPending}>
                  {loginMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
                  Unlock
                </Button>
                <Button
                  className="w-full"
                  type="button"
                  variant="outline"
                  onClick={() => router.push("/dashboard")}
                >
                  Back to Dashboard
                </Button>
                {tokenRejected && (
                  <p className="text-center text-sm text-destructive">
                    Your Automated Agent session expired. Sign in again.
                  </p>
                )}
              </form>
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
              Automated Agent
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Unattended policy push controls for current-day and year-to-date runs.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => router.push("/dashboard")}>
              Dashboard
            </Button>
            <Button variant="outline" size="sm" onClick={logout}>
              <LogOut className="h-4 w-4" />
              Lock
            </Button>
            <ThemeToggle />
          </div>
        </header>

        {!sessionsReady && (
          <Alert className="mb-6 border-amber-500/50 bg-amber-500/10 text-amber-800 dark:text-amber-200">
            <AlertTitle>Push sessions required</AlertTitle>
            <AlertDescription>
              Log in to the dedicated automated A&G Push and NIID Push sessions before starting an automated agent.
            </AlertDescription>
          </Alert>
        )}

        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-4">
          <Card className="rounded-lg">
            <CardHeader className="pb-2">
              <CardDescription>Status</CardDescription>
              <CardTitle className="capitalize">{status?.status || "loading"}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {status?.mode ? status.mode.replace("_", " ") : status?.message || "No active automated agent."}
            </CardContent>
          </Card>

          <Card className="rounded-lg">
            <CardHeader className="pb-2">
              <CardDescription>Sessions</CardDescription>
              <CardTitle className="text-base">Push Lane</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <StatusBadge active={Boolean(status?.sessions?.ag_auto_push?.isActive)} label="A&G Auto Push" />
              <StatusBadge active={Boolean(status?.sessions?.niid_auto_push?.isActive)} label="NIID Auto Push" />
            </CardContent>
          </Card>

          <Card className="rounded-lg">
            <CardHeader className="pb-2">
              <CardDescription>Queue</CardDescription>
              <CardTitle>{status?.queue?.isBusy ? "Busy" : "Available"}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {status?.queue?.waiting?.length || 0} waiting
            </CardContent>
          </Card>

          <Card className="rounded-lg">
            <CardHeader className="pb-2">
              <CardDescription>YTD Progress</CardDescription>
              <CardTitle>{status?.yearToDate?.completedBatches || 0} batches</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Next: {status?.yearToDate?.nextDate || "Not started"}
            </CardContent>
          </Card>
        </div>

        <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle>Current Day Repeater</CardTitle>
              <CardDescription>
                Pushes today&apos;s policies immediately, then every 10 minutes until the day ends.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex items-center gap-3">
              <Button
                onClick={() => startCurrentDay.mutate()}
                disabled={!canStart || startCurrentDay.isPending}
              >
                {startCurrentDay.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                Start
              </Button>
              <Badge variant="outline">Today to today</Badge>
            </CardContent>
          </Card>

          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle>Year-To-Date Batch Agent</CardTitle>
              <CardDescription>
                Pushes January 1 through today in two-day calendar batches, then stops.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex items-center gap-3">
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    onClick={() => startYearToDate.mutate()}
                    disabled={!canStart || startYearToDate.isPending}
                  >
                    {startYearToDate.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                    Start
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => continueYearToDate.mutate()}
                    disabled={!canStart || continueYearToDate.isPending}
                  >
                    {continueYearToDate.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                    Continue
                  </Button>
                  <Badge variant="outline">Two-day batches</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Start resets to January 1. Continue resumes from {status?.yearToDate?.nextDate || "the saved next date"}.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="mb-8">
          <SessionControl mode="automated" />
        </div>

        {isRunning && (
          <div className="mb-8">
            <Button
              variant="destructive"
              onClick={() => stopAgent.mutate()}
              disabled={stopAgent.isPending}
            >
              {stopAgent.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" />}
              Stop Automated Agent
            </Button>
          </div>
        )}

        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle>Automation Logs</CardTitle>
            <CardDescription>
              Permanent automated push history. Showing {visibleLogs.length} of {pagination?.total || 0} stored logs.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <Badge variant="outline">
                {pagination?.total || 0} total
              </Badge>
              <Button
                variant="outline"
                size="sm"
                onClick={() => logsQuery.refetch()}
                disabled={logsQuery.isFetching}
              >
                {logsQuery.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clock className="h-4 w-4" />}
                Refresh Logs
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push("/automated-agent/logs")}
              >
                View All Logs
              </Button>
            </div>
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
                  {visibleLogs.length === 0 && (
                    <tr>
                      <td className="py-6 text-muted-foreground" colSpan={6}>
                        No automated logs yet.
                      </td>
                    </tr>
                  )}
                  {visibleLogs.map((run) => (
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
