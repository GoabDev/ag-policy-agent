import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Search, RefreshCw, Eye, XCircle } from 'lucide-react';
import { RotateCcw } from 'lucide-react';
import {
  useClosePolicyStatus,
  useResetPolicyStatus,
  useStartPolicyStatus,
} from '@/queries/usePolicyStatus';
import type { PolicyStatusTaskState } from '@/hooks/useSSE';

function StatusBadge({ status }: { status: PolicyStatusTaskState['status'] }) {
  if (status === 'awaiting_user_action') {
    return <Badge className="bg-amber-500/10 text-amber-700 dark:text-amber-300">Awaiting Review</Badge>;
  }
  if (status === 'completed') {
    return <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">Closed</Badge>;
  }
  if (status === 'failed') {
    return <Badge className="bg-destructive/10 text-destructive">Failed</Badge>;
  }
  return <Badge className="bg-primary/10 text-primary">Loading</Badge>;
}

export function PolicyStatusForm({
  policyStatusTasks,
}: {
  policyStatusTasks: Map<string, PolicyStatusTaskState>;
}) {
  const [lookupValue, setLookupValue] = useState('');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const startMutation = useStartPolicyStatus();
  const closeMutation = useClosePolicyStatus();
  const resetMutation = useResetPolicyStatus();

  const currentTasks = useMemo(
    () =>
      Array.from(policyStatusTasks.values())
        .filter((task) => task.status !== 'completed')
        .sort((a, b) => a.id.localeCompare(b.id))
        .reverse(),
    [policyStatusTasks],
  );

  const selectedTask = selectedTaskId ? policyStatusTasks.get(selectedTaskId) || null : null;

  useEffect(() => {
    const awaitingTask = currentTasks.find((task) => task.status === 'awaiting_user_action');
    if (awaitingTask) {
      setSelectedTaskId(awaitingTask.id);
    }
  }, [currentTasks]);

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = lookupValue.trim();
    if (!trimmed) return;

    startMutation.mutate({ lookupValue: trimmed });
  };

  const handleCloseTask = async () => {
    if (!selectedTaskId) return;
    await closeMutation.mutateAsync(selectedTaskId);
    setSelectedTaskId(null);
  };

  const handleResetTask = async () => {
    if (!selectedTaskId) return;
    await resetMutation.mutateAsync(selectedTaskId);
  };

  return (
    <>
      <Card className="overflow-hidden border-border bg-card shadow-xl">
        <CardHeader className="border-b border-border py-4">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Search className="h-4 w-4 text-muted-foreground" />
            Pol Status
            {currentTasks.length > 0 && (
              <Badge className="ml-auto bg-primary/10 text-[10px] text-primary">
                {currentTasks.length} active
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 p-6">
          <div className="text-[11px] text-muted-foreground">
            Check E-PIN upload status by policy number or reg number, review the extracted NIID/NIIP push response, and close the task after confirmation.
          </div>

          <form onSubmit={onSubmit} className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Policy / Reg Number
              </label>
              <Input
                value={lookupValue}
                onChange={(event) => setLookupValue(event.target.value)}
                placeholder="e.g. P/AG/MC1/26/IBD/C2194857 or LEL121VP"
                className="border-border bg-background focus-visible:ring-primary/50"
              />
            </div>
            <Button type="submit" className="w-full font-semibold" disabled={startMutation.isPending}>
              {startMutation.isPending ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Checking status...
                </>
              ) : (
                <>
                  <Search className="mr-2 h-4 w-4" />
                  Check Status
                </>
              )}
            </Button>
          </form>

          {currentTasks.length > 0 && (
            <div className="space-y-2">
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Current Tasks
              </div>
              <div className="space-y-2">
                {currentTasks.map((task) => (
                  <div
                    key={task.id}
                    className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{task.lookupValue}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {task.result
                          ? task.result.message ||
                            `${task.result.summaryRows.length} summary row(s), ${task.result.trailRows.length} trail row(s)`
                          : 'Waiting for page data'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={task.status} />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs"
                        onClick={() => setSelectedTaskId(task.id)}
                        disabled={!task.result}
                      >
                        <Eye className="mr-1 h-3 w-3" />
                        View
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selectedTask} onOpenChange={(open) => !open && setSelectedTaskId(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-6xl">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <DialogTitle className="text-base">Policy Status Details</DialogTitle>
              {selectedTask && <StatusBadge status={selectedTask.status} />}
            </div>
            <DialogDescription className="text-xs">
              {selectedTask?.lookupValue || 'N/A'}
            </DialogDescription>
          </DialogHeader>

          {selectedTask?.result && (
            <div className="space-y-4">
              {selectedTask.result.message && (
                <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm text-foreground">
                  {selectedTask.result.message}
                </div>
              )}
              <div>
                <h4 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Status Table
                </h4>
                <div className="overflow-x-auto rounded-lg border border-border">
                  <Table>
                    <TableHeader className="bg-muted/50">
                      <TableRow>
                        <TableHead>Policy No</TableHead>
                        <TableHead>Reg No</TableHead>
                        <TableHead>Cover Date</TableHead>
                        <TableHead>Make</TableHead>
                        <TableHead>Model</TableHead>
                        <TableHead>Response</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedTask.result.summaryRows.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center text-muted-foreground">
                            No summary rows found
                          </TableCell>
                        </TableRow>
                      ) : (
                        selectedTask.result.summaryRows.map((row, index) => (
                          <TableRow key={`${row.policyNo}-${index}`}>
                            <TableCell>{row.policyNo}</TableCell>
                            <TableCell>{row.regNo}</TableCell>
                            <TableCell>{row.coverDate}</TableCell>
                            <TableCell>{row.vehicleMake}</TableCell>
                            <TableCell>{row.vehicleModel}</TableCell>
                            <TableCell>{row.response}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>

              <div>
                <h4 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Trail Table
                </h4>
                <div className="overflow-x-auto rounded-lg border border-border">
                  <Table>
                    <TableHeader className="bg-muted/50">
                      <TableRow>
                        <TableHead>Trail Date</TableHead>
                        <TableHead>Time</TableHead>
                        <TableHead>Policy No</TableHead>
                        <TableHead>Response</TableHead>
                        <TableHead>Server</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedTask.result.trailRows.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-muted-foreground">
                            No trail rows found
                          </TableCell>
                        </TableRow>
                      ) : (
                        selectedTask.result.trailRows.map((row, index) => (
                          <TableRow key={`${row.policyNo}-${row.time}-${index}`}>
                            <TableCell>{row.trailDate}</TableCell>
                            <TableCell>{row.time}</TableCell>
                            <TableCell>{row.policyNo}</TableCell>
                            <TableCell>{row.response}</TableCell>
                            <TableCell>{row.server}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          )}

          {selectedTask?.error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {selectedTask.error}
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setSelectedTaskId(null)}
            >
              Back
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleResetTask}
              disabled={
                !selectedTask ||
                resetMutation.isPending ||
                selectedTask.status !== 'awaiting_user_action' ||
                !selectedTask.result?.summaryRows.some((row) => row.canReset)
              }
            >
              {resetMutation.isPending ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Resetting...
                </>
              ) : (
                <>
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Reset Push
                </>
              )}
            </Button>
            <Button
              type="button"
              onClick={handleCloseTask}
              disabled={!selectedTask || closeMutation.isPending || selectedTask.status !== 'awaiting_user_action'}
            >
              {closeMutation.isPending ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Closing...
                </>
              ) : (
                <>
                  <XCircle className="mr-2 h-4 w-4" />
                  Close
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
