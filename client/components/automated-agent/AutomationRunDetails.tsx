"use client";

import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface AutomatedAgentRun {
  id: string;
  source?: "manual" | "automated";
  automationRunId?: string;
  automationMode?: string;
  input?: {
    method?: string;
    policyNumber?: string;
    fromDate?: string;
    toDate?: string;
  };
  status: string;
  createdAt?: string;
  completedAt?: string;
  error?: string;
  downloadedFile?: string;
  uploadResult?: string;
  uploadHasResults?: boolean;
  steps?: Array<{
    timestamp: string;
    site: string;
    action: string;
    status: string;
    details?: string;
  }>;
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value?: string | number | null;
}) {
  if (value === undefined || value === null || value === "") return null;
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border/50 py-1.5 last:border-0">
      <span className="shrink-0 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className="break-all text-right text-sm text-foreground">
        {String(value)}
      </span>
    </div>
  );
}

function formatDateTime(value?: string) {
  return value ? new Date(value).toLocaleString() : undefined;
}

export function AutomatedRunDialog({
  run,
  open,
  onOpenChange,
}: {
  run: AutomatedAgentRun | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!run) return null;
  const range =
    run.input?.method === "date_range"
      ? `${run.input?.fromDate} to ${run.input?.toDate}`
      : run.input?.policyNumber || "N/A";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <DialogTitle className="text-base">Automation Push Details</DialogTitle>
            <Badge variant="outline" className="capitalize">
              {run.status}
            </Badge>
          </div>
          <DialogDescription className="text-xs">
            {range}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-0.5 rounded-lg border border-border p-3">
            <DetailRow label="Agent" value={run.automationMode?.replace("_", " ")} />
            <DetailRow label="Method" value={run.input?.method?.replace("_", " ")} />
            <DetailRow label="From" value={run.input?.fromDate} />
            <DetailRow label="To" value={run.input?.toDate} />
            <DetailRow label="Policy Number" value={run.input?.policyNumber} />
            <DetailRow label="Policy Push Task" value={run.id} />
            <DetailRow label="Automation Run" value={run.automationRunId} />
            <DetailRow label="Started" value={formatDateTime(run.createdAt)} />
            <DetailRow label="Completed" value={formatDateTime(run.completedAt)} />
            <DetailRow label="Downloaded File" value={run.downloadedFile} />
          </div>

          {run.uploadResult && (
            <div>
              <h4 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Upload Result
              </h4>
              <div className="rounded-lg border border-border p-3 text-sm text-foreground">
                {run.uploadResult}
              </div>
            </div>
          )}

          {run.error && (
            <div>
              <h4 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Error
              </h4>
              <div className="rounded-lg border border-border p-3 text-sm text-destructive">
                {run.error}
              </div>
            </div>
          )}

          {run.steps && run.steps.length > 0 && (
            <div>
              <h4 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Steps ({run.steps.length})
              </h4>
              <div className="divide-y divide-border/50 rounded-lg border border-border">
                {run.steps.map((step, index) => (
                  <div key={`${step.timestamp}-${index}`} className="p-2.5 text-xs">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <Badge className="h-4 px-1 text-[8px]">
                          {step.site.toUpperCase().replace("_", " ")}
                        </Badge>
                        <span className="font-medium text-foreground">{step.action}</span>
                      </div>
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        {new Date(step.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    {step.details && (
                      <p className="mt-1 break-all text-muted-foreground">
                        {step.details}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
  );
}
