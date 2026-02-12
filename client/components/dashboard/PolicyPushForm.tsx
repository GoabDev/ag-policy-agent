import React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Upload,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  Layers,
  Construction,
} from "lucide-react";
import { usePushPolicy } from "@/queries/useCorrections";
import {
  policyPushSchema,
  type PolicyPushFormValues,
} from "@/schema/policyPush";
import type { TaskState } from "@/hooks/useSSE";

/** Format a Date to the backend-expected format: DD-MMM-YYYY (e.g. "01-Feb-2026") */
function formatDateForBackend(date: Date): string {
  return format(date, "dd-MMM-yyyy");
}

export function PolicyPushForm({
  activeTasks,
  tasks,
}: {
  activeTasks: TaskState[];
  tasks: Map<string, TaskState>;
}) {
  const pushMutation = usePushPolicy();

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<PolicyPushFormValues>({
    resolver: zodResolver(policyPushSchema),
    defaultValues: {
      method: "policy_number",
      policyNumber: "",
    },
  });

  const method = watch("method");

  // Filter to only push tasks
  const pushActiveTasks = activeTasks.filter((t) => t.type === "policy_push");

  const onSubmit = (data: PolicyPushFormValues) => {
    if (data.method === "policy_number") {
      pushMutation.mutate({
        method: "policy_number",
        policyNumber: data.policyNumber,
      });
    } else {
      pushMutation.mutate({
        method: "date_range",
        fromDate: formatDateForBackend(data.fromDate),
        toDate: formatDateForBackend(data.toDate),
      });
    }
  };

  return (
    <Card className="bg-card border-border shadow-xl overflow-hidden">
      <CardHeader className="border-b border-border py-4">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Upload className="w-4 h-4 text-muted-foreground" />
          Push Policy to NIID
          {pushActiveTasks.length > 0 && (
            <Badge className="ml-auto bg-primary/10 text-primary text-[10px]">
              <Layers className="w-3 h-3 mr-1" />
              {pushActiveTasks.length} running
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6 relative">
        {/* Development Overlay */}
        <div className="absolute inset-0 z-10 bg-background/80 backdrop-blur-[2px] flex flex-col items-center justify-center gap-4 rounded-b-xl">
          <div className="flex items-center justify-center w-14 h-14 rounded-full bg-primary/10 border border-primary/20">
            <Construction className="w-7 h-7 text-primary" />
          </div>
          <div className="text-center space-y-1.5 px-8">
            <h3 className="text-sm font-semibold text-foreground">
              Currently in Development
            </h3>
            <p className="text-[11px] text-muted-foreground leading-relaxed max-w-[260px]">
              This feature is being finalized and will be available in an
              upcoming release.
            </p>
          </div>
          <Badge className="bg-primary/10 text-primary text-[10px] font-medium mt-1">
            Coming Soon
          </Badge>
        </div>

        <Tabs
          value={method}
          onValueChange={(v) =>
            setValue("method", v as "policy_number" | "date_range")
          }
          className="mb-6"
        >
          <TabsList className="grid grid-cols-2 bg-background p-1 h-10 border border-border">
            <TabsTrigger
              value="policy_number"
              className="text-xs data-[state=active]:bg-secondary"
            >
              By Policy Number
            </TabsTrigger>
            <TabsTrigger
              value="date_range"
              className="text-xs data-[state=active]:bg-secondary"
            >
              By Date Range
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="text-[11px] text-muted-foreground mb-6 flex items-center gap-2">
          <Upload className="w-3 h-3" />
          Downloads from A&G spool, renames sheet to Sheet1, and uploads to NIID
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {method === "policy_number" && (
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                Policy Number
              </label>
              <Input
                {...register("policyNumber")}
                placeholder="e.g. P/AG/PMI/23/ESA/2522010"
                className="bg-background border-border focus-visible:ring-primary/50"
              />
              {(errors as any).policyNumber && (
                <p className="text-[10px] text-destructive">
                  {(errors as any).policyNumber.message}
                </p>
              )}
            </div>
          )}

          {method === "date_range" && (
            <>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                  From Date
                </label>
                <DatePicker
                  date={watch("fromDate" as any)}
                  onDateChange={(d: Date | undefined) => {
                    if (d) setValue("fromDate" as any, d);
                  }}
                  placeholder="Select start date"
                />
                {watch("fromDate" as any) && (
                  <p className="text-[10px] text-muted-foreground">
                    {formatDateForBackend(watch("fromDate" as any))}
                  </p>
                )}
                {(errors as any).fromDate && (
                  <p className="text-[10px] text-destructive">
                    {(errors as any).fromDate.message}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                  To Date
                </label>
                <DatePicker
                  date={watch("toDate" as any)}
                  onDateChange={(d: Date | undefined) => {
                    if (d) setValue("toDate" as any, d);
                  }}
                  placeholder="Select end date"
                />
                {watch("toDate" as any) && (
                  <p className="text-[10px] text-muted-foreground">
                    {formatDateForBackend(watch("toDate" as any))}
                  </p>
                )}
                {(errors as any).toDate && (
                  <p className="text-[10px] text-destructive">
                    {(errors as any).toDate.message}
                  </p>
                )}
              </div>
            </>
          )}

          <Button
            type="submit"
            className="w-full font-semibold transition-all"
            disabled={pushMutation.isPending}
          >
            {pushMutation.isPending ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />{" "}
                Submitting...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4 mr-2" /> Push Policy
              </>
            )}
          </Button>
        </form>

        {/* Active Push Tasks Progress */}
        {pushActiveTasks.length > 0 && (
          <div className="mt-8 space-y-4 pt-6 border-t border-border/50">
            <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
              Active Push Tasks ({pushActiveTasks.length})
            </h4>
            {pushActiveTasks.map((task) => (
              <div
                key={task.id}
                className="rounded-lg border border-border p-3 space-y-2"
              >
                <div className="flex items-center gap-2 text-xs">
                  <RefreshCw className="w-3 h-3 animate-spin text-primary" />
                  <span className="text-foreground font-medium">
                    Policy Push
                  </span>
                  <span className="text-muted-foreground">
                    — {task.policyNumber}
                  </span>
                  <Badge className="ml-auto bg-primary/10 text-primary text-[9px]">
                    {task.steps.length} steps
                  </Badge>
                </div>
                <div className="space-y-1">
                  {task.steps.map((s, i) => (
                    <div
                      key={i}
                      className={`flex items-center gap-2 px-2 py-1 rounded text-[11px] ${
                        s.status === "success"
                          ? "bg-emerald-500/5 text-emerald-600 dark:text-emerald-300"
                          : s.status === "failed"
                            ? "bg-destructive/5 text-destructive"
                            : "bg-primary/5 text-primary"
                      }`}
                    >
                      <Badge
                        className={`h-3.5 text-[8px] px-1 ${s.site === "ag" ? "bg-primary/20 text-primary" : "bg-amber-500/20 text-amber-600 dark:text-amber-400"}`}
                      >
                        {(s.site || "").toUpperCase().replace("_", " ")}
                      </Badge>
                      <span className="opacity-80">
                        {s.status === "success" ? (
                          <CheckCircle2 className="w-3 h-3" />
                        ) : s.status === "failed" ? (
                          <XCircle className="w-3 h-3" />
                        ) : (
                          <Clock className="w-3 h-3" />
                        )}
                      </span>
                      <span className="flex-1">{s.action}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Recently completed/failed push tasks */}
        {Array.from(tasks.values()).filter(
          (t) => t.type === "policy_push" && t.status !== "running",
        ).length > 0 && (
          <div className="mt-4 space-y-2">
            {Array.from(tasks.values())
              .filter((t) => t.type === "policy_push" && t.status !== "running")
              .map((task) => (
                <div
                  key={task.id}
                  className={`flex items-center gap-2 p-2 rounded-lg text-xs ${
                    task.status === "completed"
                      ? "bg-emerald-500/5 text-emerald-600 dark:text-emerald-300"
                      : "bg-destructive/5 text-destructive"
                  }`}
                >
                  <span>
                    {task.status === "completed" ? (
                      <CheckCircle2 className="w-4 h-4" />
                    ) : (
                      <XCircle className="w-4 h-4" />
                    )}
                  </span>
                  <span>Policy Push — {task.policyNumber}</span>
                  <span className="ml-auto text-[10px] opacity-60">
                    {task.status === "completed"
                      ? "Done"
                      : task.error || "Failed"}
                  </span>
                </div>
              ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
