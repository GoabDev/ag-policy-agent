import React, { useState } from 'react';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useLogs, usePushLogs } from '@/queries/useCorrections';
import { ClipboardList, RefreshCw, CheckCircle2, XCircle, Clock, ArrowRight, Ban, Upload, Wrench, Copy, Check } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

const FIELD_LABELS: Record<string, string> = {
  firstName: 'First Name',
  lastName: 'Last Name',
  registrationNumber: 'Reg No.',
  chassisNumber: 'Chassis',
  vehicleMake: 'Make',
  vehicleModel: 'Model',
};

function ChangeDetails({ previousData, newData }: { previousData?: Record<string, string>; newData?: Record<string, string> }) {
  if (!previousData || !newData) return <span className="text-muted-foreground">—</span>;

  return (
    <div className="flex flex-col gap-0.5">
      {Object.keys(previousData).map((key) => (
        <div key={key} className="flex items-center gap-1 text-[11px]">
          <span className="text-muted-foreground">{FIELD_LABELS[key] || key}:</span>
          <span className="text-destructive/80 line-through">{previousData[key] || '(empty)'}</span>
          <ArrowRight className="w-2.5 h-2.5 text-muted-foreground" />
          <span className="text-emerald-600 dark:text-emerald-400 font-medium">{newData[key] || '(empty)'}</span>
        </div>
      ))}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'completed':
      return <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 gap-1.5"><CheckCircle2 className="w-3 h-3" /> Done</Badge>;
    case 'failed':
      return <Badge className="bg-destructive/10 text-destructive border-destructive/20 gap-1.5"><XCircle className="w-3 h-3" /> Failed</Badge>;
    case 'cancelled':
      return <Badge className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 gap-1.5"><Ban className="w-3 h-3" /> Cancelled</Badge>;
    case 'running':
      return <Badge className="bg-primary/10 text-primary border-primary/20 gap-1.5"><RefreshCw className="w-3 h-3 animate-spin" /> Running</Badge>;
    default:
      return <Badge className="bg-muted text-muted-foreground border-border gap-1.5"><Clock className="w-3 h-3" /> Pending</Badge>;
  }
}

function StepStatusIcon({ status }: { status: string }) {
  if (status === 'success') return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />;
  if (status === 'failed') return <XCircle className="w-3.5 h-3.5 text-destructive" />;
  return <Clock className="w-3.5 h-3.5 text-muted-foreground" />;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      title="Copy"
    >
      {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
    </Button>
  );
}

function DetailRow({ label, value, copyable }: { label: string; value?: string | null; copyable?: boolean }) {
  if (!value) return null;
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 border-b border-border/50 last:border-0">
      <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider shrink-0">{label}</span>
      <div className="flex items-center gap-1 text-sm text-foreground text-right">
        <span className="break-all">{value}</span>
        {copyable && <CopyButton text={value} />}
      </div>
    </div>
  );
}

const corrLabel = (type: string) => {
  return { name: 'Name', registration: 'Reg No.', vehicle_make: 'Vehicle', reg_and_chassis: 'Reg & Chassis', chassis: 'Chassis' }[type] || type;
};

const pushMethodLabel = (method: string) => {
  return { policy_number: 'Single Policy', date_range: 'Date Range' }[method] || method;
};

/* ─── Correction Detail Dialog ─── */
function CorrectionDetailDialog({ item, open, onOpenChange }: { item: any; open: boolean; onOpenChange: (open: boolean) => void }) {
  if (!item) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <DialogTitle className="text-base">Correction Details</DialogTitle>
            <StatusBadge status={item.status} />
          </div>
          <DialogDescription className="text-xs">
            {item.correction?.policyNumber || 'N/A'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Basic Info */}
          <div className="rounded-lg border border-border p-3 space-y-0.5">
            <DetailRow label="Type" value={corrLabel(item.correction?.type)} />
            <DetailRow label="Policy Number" value={item.correction?.policyNumber} copyable />
            <DetailRow label="Started" value={new Date(item.createdAt).toLocaleString()} />
            {item.completedAt && <DetailRow label="Completed" value={new Date(item.completedAt).toLocaleString()} />}
            {item.error && <DetailRow label="Error" value={item.error} copyable />}
          </div>

          {/* Changes */}
          {item.previousData && item.newData && (
            <div>
              <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Changes</h4>
              <div className="rounded-lg border border-border p-3">
                {Object.keys(item.previousData).map((key) => (
                  <div key={key} className="flex items-center gap-2 py-1.5 border-b border-border/50 last:border-0">
                    <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider w-20 shrink-0">{FIELD_LABELS[key] || key}</span>
                    <span className="text-sm text-destructive/80 line-through">{item.previousData[key] || '(empty)'}</span>
                    <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0" />
                    <span className="text-sm text-emerald-600 dark:text-emerald-400 font-medium">{item.newData[key] || '(empty)'}</span>
                    <CopyButton text={item.newData[key] || ''} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Steps */}
          {item.steps?.length > 0 && (
            <div>
              <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Steps ({item.steps.length})</h4>
              <div className="rounded-lg border border-border divide-y divide-border/50">
                {item.steps.map((s: any, i: number) => (
                  <div key={i} className="flex items-start gap-2 p-2.5 text-xs">
                    <StepStatusIcon status={s.status} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <Badge className={`h-4 text-[8px] px-1 ${s.site === 'ag' ? 'bg-primary/20 text-primary' : 'bg-amber-500/20 text-amber-600 dark:text-amber-400'}`}>
                          {(s.site || '').toUpperCase()}
                        </Badge>
                        <span className="font-medium text-foreground">{s.action}</span>
                      </div>
                      {s.details && <p className="text-muted-foreground mt-0.5 break-all">{s.details}</p>}
                    </div>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {new Date(s.timestamp).toLocaleTimeString()}
                    </span>
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

/* ─── Push Detail Dialog ─── */
function PushDetailDialog({ item, open, onOpenChange }: { item: any; open: boolean; onOpenChange: (open: boolean) => void }) {
  if (!item) return null;

  const policyOrRange = item.input?.method === 'date_range'
    ? `${item.input?.fromDate} – ${item.input?.toDate}`
    : item.input?.policyNumber;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <DialogTitle className="text-base">Push Details</DialogTitle>
            <StatusBadge status={item.status} />
          </div>
          <DialogDescription className="text-xs">
            {policyOrRange || 'N/A'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Basic Info */}
          <div className="rounded-lg border border-border p-3 space-y-0.5">
            <DetailRow label="Method" value={pushMethodLabel(item.input?.method)} />
            {item.input?.method === 'date_range' ? (
              <>
                <DetailRow label="From" value={item.input?.fromDate} />
                <DetailRow label="To" value={item.input?.toDate} />
              </>
            ) : (
              <DetailRow label="Policy Number" value={item.input?.policyNumber} copyable />
            )}
            <DetailRow label="Started" value={new Date(item.createdAt).toLocaleString()} />
            {item.completedAt && <DetailRow label="Completed" value={new Date(item.completedAt).toLocaleString()} />}
          </div>

          {/* Result */}
          {item.uploadResult && (
            <div>
              <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Upload Result</h4>
              <div className="rounded-lg border border-border p-3 text-sm text-foreground flex items-start gap-2">
                <span className="flex-1 break-all">{item.uploadResult}</span>
                <CopyButton text={item.uploadResult} />
              </div>
            </div>
          )}

          {/* Error */}
          {item.error && (
            <div>
              <h4 className="text-[10px] font-bold text-destructive uppercase tracking-wider mb-2">Error</h4>
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive flex items-start gap-2">
                <span className="flex-1 break-all">{item.error}</span>
                <CopyButton text={item.error} />
              </div>
            </div>
          )}

          {/* Downloaded File */}
          {item.downloadedFile && (
            <DetailRow label="Downloaded File" value={item.downloadedFile} copyable />
          )}

          {/* Steps */}
          {item.steps?.length > 0 && (
            <div>
              <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Steps ({item.steps.length})</h4>
              <div className="rounded-lg border border-border divide-y divide-border/50">
                {item.steps.map((s: any, i: number) => (
                  <div key={i} className="flex items-start gap-2 p-2.5 text-xs">
                    <StepStatusIcon status={s.status} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <Badge className={`h-4 text-[8px] px-1 ${
                          s.site === 'ag_push' || s.site === 'ag'
                            ? 'bg-primary/20 text-primary'
                            : 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
                        }`}>
                          {(s.site || '').toUpperCase().replace('_', ' ')}
                        </Badge>
                        <span className="font-medium text-foreground">{s.action}</span>
                      </div>
                      {s.details && <p className="text-muted-foreground mt-0.5 break-all">{s.details}</p>}
                    </div>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {new Date(s.timestamp).toLocaleTimeString()}
                    </span>
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

/* ─── Correction History Tab ─── */
function CorrectionHistoryTab() {
  const { data: history, isLoading, refetch } = useLogs();
  const [selected, setSelected] = useState<any>(null);

  return (
    <div>
      <div className="flex justify-end px-4 py-2 border-b border-border">
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          onClick={() => refetch()}
          disabled={isLoading}
        >
          <RefreshCw className={`w-3 h-3 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow className="border-border">
              <TableHead className="text-muted-foreground text-[11px] uppercase font-bold tracking-wider">Type</TableHead>
              <TableHead className="text-muted-foreground text-[11px] uppercase font-bold tracking-wider">Policy Number</TableHead>
              <TableHead className="text-muted-foreground text-[11px] uppercase font-bold tracking-wider">Changes</TableHead>
              <TableHead className="text-muted-foreground text-[11px] uppercase font-bold tracking-wider">Date</TableHead>
              <TableHead className="text-muted-foreground text-[11px] uppercase font-bold tracking-wider text-right">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {history?.data?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                  No corrections yet
                </TableCell>
              </TableRow>
            ) : (
              history?.data?.slice(0, 10).map((h: any) => (
                <TableRow
                  key={h.id}
                  className="border-border hover:bg-accent/50 transition-colors cursor-pointer"
                  onClick={() => setSelected(h)}
                >
                  <TableCell>
                    <Badge variant="secondary" className="bg-secondary text-secondary-foreground font-mono text-[10px]">
                      {corrLabel(h.correction?.type)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-foreground font-medium text-sm">
                    {h.correction?.policyNumber || '—'}
                  </TableCell>
                  <TableCell>
                    <ChangeDetails previousData={h.previousData} newData={h.newData} />
                  </TableCell>
                  <TableCell className="text-muted-foreground text-[11px]">
                    {new Date(h.createdAt).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <StatusBadge status={h.status} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <CorrectionDetailDialog item={selected} open={!!selected} onOpenChange={(open) => !open && setSelected(null)} />
    </div>
  );
}

/* ─── Push History Tab ─── */
function PushHistoryTab() {
  const { data: history, isLoading, refetch } = usePushLogs();
  const [selected, setSelected] = useState<any>(null);

  return (
    <div>
      <div className="flex justify-end px-4 py-2 border-b border-border">
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          onClick={() => refetch()}
          disabled={isLoading}
        >
          <RefreshCw className={`w-3 h-3 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow className="border-border">
              <TableHead className="text-muted-foreground text-[11px] uppercase font-bold tracking-wider">Method</TableHead>
              <TableHead className="text-muted-foreground text-[11px] uppercase font-bold tracking-wider">Policy / Range</TableHead>
              <TableHead className="text-muted-foreground text-[11px] uppercase font-bold tracking-wider">Result</TableHead>
              <TableHead className="text-muted-foreground text-[11px] uppercase font-bold tracking-wider">Date</TableHead>
              <TableHead className="text-muted-foreground text-[11px] uppercase font-bold tracking-wider text-right">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {history?.data?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                  No push history yet
                </TableCell>
              </TableRow>
            ) : (
              history?.data?.slice(0, 10).map((h: any) => (
                <TableRow
                  key={h.id}
                  className="border-border hover:bg-accent/50 transition-colors cursor-pointer"
                  onClick={() => setSelected(h)}
                >
                  <TableCell>
                    <Badge variant="secondary" className="bg-secondary text-secondary-foreground font-mono text-[10px]">
                      {pushMethodLabel(h.input?.method)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-foreground font-medium text-sm">
                    {h.input?.method === 'date_range'
                      ? `${h.input?.fromDate} – ${h.input?.toDate}`
                      : h.input?.policyNumber || '—'}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs max-w-[250px]">
                    {h.uploadResult
                      ? <span className="line-clamp-2">{h.uploadResult}</span>
                      : h.error
                        ? <span className="text-destructive/80 line-clamp-2">{h.error}</span>
                        : <span>—</span>}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-[11px]">
                    {new Date(h.createdAt).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <StatusBadge status={h.status} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <PushDetailDialog item={selected} open={!!selected} onOpenChange={(open) => !open && setSelected(null)} />
    </div>
  );
}

/* ─── Main Component ─── */
export function HistoryTable() {
  return (
    <Card className="bg-card border-border shadow-xl lg:col-span-2">
      <Tabs defaultValue="corrections">
        <CardHeader className="border-b border-border py-3 px-4">
          <div className="flex items-center gap-3">
            <ClipboardList className="w-4 h-4 text-muted-foreground" />
            <TabsList variant="line" className="h-8">
              <TabsTrigger value="corrections" className="text-xs gap-1.5 px-3">
                <Wrench className="w-3 h-3" />
                Correction History
              </TabsTrigger>
              <TabsTrigger value="pushes" className="text-xs gap-1.5 px-3">
                <Upload className="w-3 h-3" />
                Push History
              </TabsTrigger>
            </TabsList>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <TabsContent value="corrections" className="mt-0">
            <CorrectionHistoryTab />
          </TabsContent>
          <TabsContent value="pushes" className="mt-0">
            <PushHistoryTab />
          </TabsContent>
        </CardContent>
      </Tabs>
    </Card>
  );
}
