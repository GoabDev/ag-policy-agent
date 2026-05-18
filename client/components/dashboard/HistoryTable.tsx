import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useLogs, usePushLogs } from '@/queries/useCorrections';
import {
  ClipboardList,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowRight,
  Ban,
  Upload,
  Wrench,
  Search,
  Copy,
  Check,
  RotateCcw,
} from 'lucide-react';
import { usePolicyStatusLogs } from '@/queries/usePolicyStatus';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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

type RetryCorrectionHandler = (correction: Record<string, any>) => void;

const FIELD_LABELS: Record<string, string> = {
  firstName: 'First Name',
  lastName: 'Last Name',
  email: 'Email',
  phone: 'Phone',
  engineNumber: 'Engine Number',
  registrationNumber: 'Reg No.',
  chassisNumber: 'Chassis',
  vehicleColor: 'Color',
  vehicleMake: 'Make',
  vehicleModel: 'Model',
  vehicleYear: 'Year',
  address: 'Address',
  name: 'Name',
};

const CHANGE_KEY_ALIASES: Record<string, string> = {
  newRegistrationNumber: 'registrationNumber',
  newChassisNumber: 'chassisNumber',
  newVehicleMake: 'vehicleMake',
  newVehicleModel: 'vehicleModel',
};

type ChangeEntry = {
  key: string;
  label: string;
  previousValue: string;
  nextValue: string;
  copyValue: string;
};

function normalizeChangeKey(key: string) {
  return CHANGE_KEY_ALIASES[key] || key;
}

function formatFieldLabel(key: string) {
  return key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function resolveDisplayValue(value?: string | null) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function buildChangeEntries(
  previousData?: Record<string, string>,
  newData?: Record<string, string>,
): ChangeEntry[] {
  if (!previousData || !newData) return [];

  const normalizedNewData = new Map<string, string>();
  Object.entries(newData).forEach(([key, value]) => {
    normalizedNewData.set(normalizeChangeKey(key), resolveDisplayValue(value));
  });

  const resolvedSwapName =
    resolveDisplayValue(newData.firstName) || resolveDisplayValue(newData.lastName)
      ? `${resolveDisplayValue(newData.firstName)} ${resolveDisplayValue(newData.lastName)}`.trim()
      : '';

  return Object.entries(previousData)
    .map(([rawKey, previousValue]) => {
      const isNiipField = rawKey.startsWith('niip_');
      const unprefixedKey = isNiipField ? rawKey.slice(5) : rawKey;
      const normalizedKey = normalizeChangeKey(unprefixedKey);

      let nextValue = normalizedNewData.get(normalizedKey) || '';
      if (normalizedKey === 'name' && resolvedSwapName) {
        nextValue = resolvedSwapName;
      }

      if (!nextValue) return null;

      const baseLabel = FIELD_LABELS[normalizedKey] || formatFieldLabel(normalizedKey);

      return {
        key: rawKey,
        label: isNiipField ? `NIIP ${baseLabel}` : baseLabel,
        previousValue: resolveDisplayValue(previousValue),
        nextValue,
        copyValue: nextValue,
      };
    })
    .filter((entry): entry is ChangeEntry => Boolean(entry));
}

function ChangeDetails({
  previousData,
  newData,
}: {
  previousData?: Record<string, string>;
  newData?: Record<string, string>;
}) {
  const entries = buildChangeEntries(previousData, newData);
  if (entries.length === 0) return <span className="text-muted-foreground">—</span>;

  const visibleEntries = entries.slice(0, 3);
  const hiddenCount = entries.length - visibleEntries.length;

  return (
    <div className="flex max-w-[360px] flex-col gap-1">
      {visibleEntries.map((entry) => (
        <div key={entry.key} className="flex items-start gap-1 text-[11px] leading-4">
          <span className="shrink-0 text-muted-foreground">{entry.label}:</span>
          <span className="min-w-0 truncate text-destructive/80 line-through">
            {entry.previousValue}
          </span>
          <ArrowRight className="mt-0.5 h-2.5 w-2.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 truncate font-medium text-emerald-600 dark:text-emerald-400">
            {entry.nextValue}
          </span>
        </div>
      ))}
      {hiddenCount > 0 && (
        <span className="text-[11px] font-medium text-primary">+{hiddenCount} more</span>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'completed':
      return (
        <Badge className="gap-1.5 border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="h-3 w-3" /> Done
        </Badge>
      );
    case 'failed':
      return (
        <Badge className="gap-1.5 border-destructive/20 bg-destructive/10 text-destructive">
          <XCircle className="h-3 w-3" /> Failed
        </Badge>
      );
    case 'cancelled':
      return (
        <Badge className="gap-1.5 border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400">
          <Ban className="h-3 w-3" /> Cancelled
        </Badge>
      );
    case 'running':
      return (
        <Badge className="gap-1.5 border-primary/20 bg-primary/10 text-primary">
          <RefreshCw className="h-3 w-3 animate-spin" /> Running
        </Badge>
      );
    default:
      return (
        <Badge className="gap-1.5 border-border bg-muted text-muted-foreground">
          <Clock className="h-3 w-3" /> Pending
        </Badge>
      );
  }
}

function StepStatusIcon({ status }: { status: string }) {
  if (status === 'success') return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />;
  if (status === 'failed') return <XCircle className="h-3.5 w-3.5 text-destructive" />;
  return <Clock className="h-3.5 w-3.5 text-muted-foreground" />;
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
      {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
    </Button>
  );
}

function DetailRow({
  label,
  value,
  copyable,
}: {
  label: string;
  value?: string | null;
  copyable?: boolean;
}) {
  if (!value) return null;

  return (
    <div className="flex items-start justify-between gap-4 border-b border-border/50 py-1.5 last:border-0">
      <span className="shrink-0 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <div className="flex items-center gap-1 text-right text-sm text-foreground">
        <span className="break-all">{value}</span>
        {copyable && <CopyButton text={value} />}
      </div>
    </div>
  );
}

export const corrLabel = (type: string) => {
  return {
    name: 'Name',
    registration: 'Reg No.',
    vehicle_make: 'Vehicle',
    reg_and_chassis: 'Reg & Chassis',
    chassis: 'Chassis',
    swap: 'Swap',
  }[type] || type;
};

export const pushMethodLabel = (method: string) => {
  return { policy_number: 'Single Policy', date_range: 'Date Range' }[method] || method;
};

export const policyStatusLookupLabel = (lookupType?: string) => {
  if (lookupType === 'certificate') return 'Certificate No';
  return lookupType === 'registration' ? 'Reg Number' : 'Policy Number';
};

export function CorrectionDetailDialog({
  item,
  open,
  onOpenChange,
  onRetryCorrection,
}: {
  item: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRetryCorrection?: RetryCorrectionHandler;
}) {
  if (!item) return null;

  const changeEntries = buildChangeEntries(item.previousData, item.newData);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
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
          <div className="space-y-0.5 rounded-lg border border-border p-3">
            <DetailRow label="Type" value={corrLabel(item.correction?.type)} />
            <DetailRow label="Policy Number" value={item.correction?.policyNumber} copyable />
            <DetailRow label="Started" value={new Date(item.createdAt).toLocaleString()} />
            {item.completedAt && (
              <DetailRow label="Completed" value={new Date(item.completedAt).toLocaleString()} />
            )}
            {item.error && <DetailRow label="Error" value={item.error} copyable />}
          </div>

          {changeEntries.length > 0 && (
            <div>
              <h4 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Changes
              </h4>
              <div className="rounded-lg border border-border p-3">
                {changeEntries.map((entry) => (
                  <div
                    key={entry.key}
                    className="grid grid-cols-[140px,minmax(0,1fr),20px,minmax(0,1fr),28px] items-start gap-2 border-b border-border/50 py-2 last:border-0"
                  >
                    <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      {entry.label}
                    </span>
                    <span className="min-w-0 break-words text-sm text-destructive/80 line-through">
                      {entry.previousValue}
                    </span>
                    <ArrowRight className="mt-1 h-3 w-3 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 break-words text-sm font-medium text-emerald-600 dark:text-emerald-400">
                      {entry.nextValue}
                    </span>
                    <CopyButton text={entry.copyValue} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {item.steps?.length > 0 && (
            <div>
              <h4 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Steps ({item.steps.length})
              </h4>
              <div className="divide-y divide-border/50 rounded-lg border border-border">
                {item.steps.map((s: any, i: number) => (
                  <div key={i} className="flex items-start gap-2 p-2.5 text-xs">
                    <StepStatusIcon status={s.status} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <Badge
                          className={`h-4 px-1 text-[8px] ${
                            s.site === 'ag' ? 'bg-primary/20 text-primary' : 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
                          }`}
                        >
                          {(s.site || '').toUpperCase()}
                        </Badge>
                        <span className="font-medium text-foreground">{s.action}</span>
                      </div>
                      {s.details && <p className="mt-0.5 break-all text-muted-foreground">{s.details}</p>}
                    </div>
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {new Date(s.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter showCloseButton>
          {onRetryCorrection && item.correction && (
            <Button
              type="button"
              variant="default"
              onClick={() => {
                onRetryCorrection(item.correction);
                onOpenChange(false);
              }}
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Retry
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PushDetailDialog({
  item,
  open,
  onOpenChange,
}: {
  item: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!item) return null;

  const policyOrRange =
    item.input?.method === 'date_range'
      ? `${item.input?.fromDate} – ${item.input?.toDate}`
      : item.input?.policyNumber;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <DialogTitle className="text-base">Push Details</DialogTitle>
            <StatusBadge status={item.status} />
          </div>
          <DialogDescription className="text-xs">{policyOrRange || 'N/A'}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-0.5 rounded-lg border border-border p-3">
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
            {item.completedAt && (
              <DetailRow label="Completed" value={new Date(item.completedAt).toLocaleString()} />
            )}
          </div>

          {item.uploadResult && (
            <div>
              <h4 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Upload Result
              </h4>
              <div className="flex items-start gap-2 rounded-lg border border-border p-3 text-sm text-foreground">
                <span className="flex-1 break-all">{item.uploadResult}</span>
                <CopyButton text={item.uploadResult} />
              </div>
            </div>
          )}

          {item.error && (
            <div>
              <h4 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-destructive">
                Error
              </h4>
              <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                <span className="flex-1 break-all">{item.error}</span>
                <CopyButton text={item.error} />
              </div>
            </div>
          )}

          {item.downloadedFile && (
            <DetailRow label="Downloaded File" value={item.downloadedFile} copyable />
          )}

          {item.steps?.length > 0 && (
            <div>
              <h4 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Steps ({item.steps.length})
              </h4>
              <div className="divide-y divide-border/50 rounded-lg border border-border">
                {item.steps.map((s: any, i: number) => (
                  <div key={i} className="flex items-start gap-2 p-2.5 text-xs">
                    <StepStatusIcon status={s.status} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <Badge
                          className={`h-4 px-1 text-[8px] ${
                            s.site === 'ag_push' || s.site === 'ag'
                              ? 'bg-primary/20 text-primary'
                              : 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
                          }`}
                        >
                          {(s.site || '').toUpperCase().replace('_', ' ')}
                        </Badge>
                        <span className="font-medium text-foreground">{s.action}</span>
                      </div>
                      {s.details && <p className="mt-0.5 break-all text-muted-foreground">{s.details}</p>}
                    </div>
                    <span className="shrink-0 text-[10px] text-muted-foreground">
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

export function PolicyStatusDetailDialog({
  item,
  open,
  onOpenChange,
}: {
  item: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!item) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-6xl">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <DialogTitle className="text-base">Policy Status Details</DialogTitle>
            <StatusBadge status={item.status} />
          </div>
          <DialogDescription className="text-xs">
            {item.result?.lookupValue || item.input?.lookupValue || 'N/A'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-0.5 rounded-lg border border-border p-3">
            <DetailRow
              label="Lookup Type"
              value={policyStatusLookupLabel(item.result?.lookupType || item.input?.lookupType)}
            />
            <DetailRow
              label="Lookup Value"
              value={item.result?.lookupValue || item.input?.lookupValue}
              copyable
            />
            <DetailRow label="Started" value={new Date(item.createdAt).toLocaleString()} />
            {item.completedAt && (
              <DetailRow label="Completed" value={new Date(item.completedAt).toLocaleString()} />
            )}
            {item.error && <DetailRow label="Error" value={item.error} copyable />}
          </div>

          {item.result?.message && (
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm text-foreground">
              {item.result.message}
            </div>
          )}

          {item.result?.summaryRows?.length > 0 && (
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
                    {item.result.summaryRows.map((row: any, index: number) => (
                      <TableRow key={`${row.policyNo}-${index}`}>
                        <TableCell>{row.policyNo}</TableCell>
                        <TableCell>{row.regNo}</TableCell>
                        <TableCell>{row.coverDate}</TableCell>
                        <TableCell>{row.vehicleMake}</TableCell>
                        <TableCell>{row.vehicleModel}</TableCell>
                        <TableCell>{row.response}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {item.result?.trailRows?.length > 0 && (
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
                    {item.result.trailRows.map((row: any, index: number) => (
                      <TableRow key={`${row.policyNo}-${row.time}-${index}`}>
                        <TableCell>{row.trailDate}</TableCell>
                        <TableCell>{row.time}</TableCell>
                        <TableCell>{row.policyNo}</TableCell>
                        <TableCell>{row.response}</TableCell>
                        <TableCell>{row.server}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {item.result?.detailRows?.length > 0 && (
            <div>
              <h4 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Full Details
              </h4>
              <div className="overflow-x-auto rounded-lg border border-border">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow>
                      <TableHead>Field</TableHead>
                      <TableHead>Value</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {item.result.detailRows.map((row: any, index: number) => (
                      <TableRow key={`${row.label}-${index}`}>
                        <TableCell>{row.label}</TableCell>
                        <TableCell>{row.value}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {item.steps?.length > 0 && (
            <div>
              <h4 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Steps ({item.steps.length})
              </h4>
              <div className="divide-y divide-border/50 rounded-lg border border-border">
                {item.steps.map((s: any, i: number) => (
                  <div key={i} className="flex items-start gap-2 p-2.5 text-xs">
                    <StepStatusIcon status={s.status} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <Badge className="h-4 bg-primary/20 px-1 text-[8px] text-primary">
                          {(s.site || '').toUpperCase()}
                        </Badge>
                        <span className="font-medium text-foreground">{s.action}</span>
                      </div>
                      {s.details && <p className="mt-0.5 break-all text-muted-foreground">{s.details}</p>}
                    </div>
                    <span className="shrink-0 text-[10px] text-muted-foreground">
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

function CorrectionHistoryTab({
  onRetryCorrection,
}: {
  onRetryCorrection?: RetryCorrectionHandler;
}) {
  const router = useRouter();
  const [searchValue, setSearchValue] = useState('');
  const deferredSearch = React.useDeferredValue(searchValue);
  const { data: history, isFetching, refetch } = useLogs({
    page: 1,
    pageSize: 10,
    search: deferredSearch,
  });
  const [selected, setSelected] = useState<any>(null);
  const items = history?.data?.items || [];

  return (
    <div>
      <div className="flex flex-col gap-3 border-b border-border px-4 py-3 md:flex-row md:items-center md:justify-between">
        <span className="text-xs text-muted-foreground">
          Showing {items.length} of {history?.data?.pagination?.total || 0}
          {deferredSearch ? ' matching correction(s)' : ''}
        </span>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
              placeholder="Search corrections"
              className="h-8 pl-8 text-xs"
            />
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            onClick={() => router.push('/history?tab=corrections')}
          >
            View all
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={`mr-2 h-3 w-3 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow className="border-border">
              <TableHead className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Type
              </TableHead>
              <TableHead className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Policy Number
              </TableHead>
              <TableHead className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Changes
              </TableHead>
              <TableHead className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Date
              </TableHead>
              <TableHead className="text-right text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Status
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                  No corrections yet
                </TableCell>
              </TableRow>
            ) : (
              items.map((h: any) => (
                <TableRow
                  key={h.id}
                  className="cursor-pointer border-border transition-colors hover:bg-accent/50"
                  onClick={() => setSelected(h)}
                >
                  <TableCell>
                    <Badge
                      variant="secondary"
                      className="bg-secondary font-mono text-[10px] text-secondary-foreground"
                    >
                      {corrLabel(h.correction?.type)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm font-medium text-foreground">
                    {h.correction?.policyNumber || '—'}
                  </TableCell>
                  <TableCell>
                    <ChangeDetails previousData={h.previousData} newData={h.newData} />
                  </TableCell>
                  <TableCell className="text-[11px] text-muted-foreground">
                    {new Date(h.createdAt).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <StatusBadge status={h.status} />
                      {onRetryCorrection && h.correction && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={(event) => {
                            event.stopPropagation();
                            onRetryCorrection(h.correction);
                          }}
                        >
                          <RotateCcw className="mr-1.5 h-3 w-3" />
                          Retry
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <CorrectionDetailDialog
        item={selected}
        open={!!selected}
        onOpenChange={(open) => !open && setSelected(null)}
        onRetryCorrection={onRetryCorrection}
      />
    </div>
  );
}

function PushHistoryTab() {
  const router = useRouter();
  const [searchValue, setSearchValue] = useState('');
  const deferredSearch = React.useDeferredValue(searchValue);
  const { data: history, isFetching, refetch } = usePushLogs({
    page: 1,
    pageSize: 10,
    search: deferredSearch,
  });
  const [selected, setSelected] = useState<any>(null);
  const items = history?.data?.items || [];

  return (
    <div>
      <div className="flex flex-col gap-3 border-b border-border px-4 py-3 md:flex-row md:items-center md:justify-between">
        <span className="text-xs text-muted-foreground">
          Showing {items.length} of {history?.data?.pagination?.total || 0}
          {deferredSearch ? ' matching push(es)' : ''}
        </span>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
              placeholder="Search push history"
              className="h-8 pl-8 text-xs"
            />
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            onClick={() => router.push('/history?tab=pushes')}
          >
            View all
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={`mr-2 h-3 w-3 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow className="border-border">
              <TableHead className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Method
              </TableHead>
              <TableHead className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Policy / Range
              </TableHead>
              <TableHead className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Result
              </TableHead>
              <TableHead className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Date
              </TableHead>
              <TableHead className="text-right text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Status
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                  No push history yet
                </TableCell>
              </TableRow>
            ) : (
              items.map((h: any) => (
                <TableRow
                  key={h.id}
                  className="cursor-pointer border-border transition-colors hover:bg-accent/50"
                  onClick={() => setSelected(h)}
                >
                  <TableCell>
                    <Badge
                      variant="secondary"
                      className="bg-secondary font-mono text-[10px] text-secondary-foreground"
                    >
                      {pushMethodLabel(h.input?.method)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm font-medium text-foreground">
                    {h.input?.method === 'date_range'
                      ? `${h.input?.fromDate} – ${h.input?.toDate}`
                      : h.input?.policyNumber || '—'}
                  </TableCell>
                  <TableCell className="max-w-[250px] text-xs text-muted-foreground">
                    {h.uploadResult ? (
                      <span className="line-clamp-2">{h.uploadResult}</span>
                    ) : h.error ? (
                      <span className="line-clamp-2 text-destructive/80">{h.error}</span>
                    ) : (
                      <span>—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-[11px] text-muted-foreground">
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
      <PushDetailDialog
        item={selected}
        open={!!selected}
        onOpenChange={(open) => !open && setSelected(null)}
      />
    </div>
  );
}

function PolicyStatusHistoryTab() {
  const router = useRouter();
  const [searchValue, setSearchValue] = useState('');
  const deferredSearch = React.useDeferredValue(searchValue);
  const { data: history, isFetching, refetch } = usePolicyStatusLogs({
    page: 1,
    pageSize: 10,
    search: deferredSearch,
  });
  const [selected, setSelected] = useState<any>(null);
  const items = history?.data?.items || [];

  return (
    <div>
      <div className="flex flex-col gap-3 border-b border-border px-4 py-3 md:flex-row md:items-center md:justify-between">
        <span className="text-xs text-muted-foreground">
          Showing {items.length} of {history?.data?.pagination?.total || 0}
          {deferredSearch ? ' matching status log(s)' : ''}
        </span>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
              placeholder="Search status history"
              className="h-8 pl-8 text-xs"
            />
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            onClick={() => router.push('/history?tab=polstatus')}
          >
            View all
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={`mr-2 h-3 w-3 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow className="border-border">
              <TableHead className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Lookup
              </TableHead>
              <TableHead className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Value
              </TableHead>
              <TableHead className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Result
              </TableHead>
              <TableHead className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Date
              </TableHead>
              <TableHead className="text-right text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Status
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                  No policy status history yet
                </TableCell>
              </TableRow>
            ) : (
              items.map((h: any) => (
                <TableRow
                  key={h.id}
                  className="cursor-pointer border-border transition-colors hover:bg-accent/50"
                  onClick={() => setSelected(h)}
                >
                  <TableCell>
                    <Badge
                      variant="secondary"
                      className="bg-secondary font-mono text-[10px] text-secondary-foreground"
                    >
                      {policyStatusLookupLabel(h.result?.lookupType || h.input?.lookupType)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm font-medium text-foreground">
                    {h.result?.lookupValue || h.input?.lookupValue || '—'}
                  </TableCell>
                  <TableCell className="max-w-[250px] text-xs text-muted-foreground">
                    {h.result?.message ? (
                      <span className="line-clamp-2">{h.result.message}</span>
                    ) : h.result?.summaryRows?.[0]?.response ? (
                      <span className="line-clamp-2">{h.result.summaryRows[0].response}</span>
                    ) : h.error ? (
                      <span className="line-clamp-2 text-destructive/80">{h.error}</span>
                    ) : (
                      <span>—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-[11px] text-muted-foreground">
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
      <PolicyStatusDetailDialog
        item={selected}
        open={!!selected}
        onOpenChange={(open) => !open && setSelected(null)}
      />
    </div>
  );
}

export function HistoryTable({
  onRetryCorrection,
}: {
  onRetryCorrection?: RetryCorrectionHandler;
}) {
  return (
    <Card className="shadow-xl lg:col-span-2 border-border bg-card">
      <Tabs defaultValue="corrections">
        <CardHeader className="border-b border-border px-4 py-3">
          <div className="flex items-center gap-3">
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
            <TabsList variant="line" className="h-8">
              <TabsTrigger value="corrections" className="gap-1.5 px-3 text-xs">
                <Wrench className="h-3 w-3" />
                Correction History
              </TabsTrigger>
              <TabsTrigger value="polstatus" className="gap-1.5 px-3 text-xs">
                <Search className="h-3 w-3" />
                Pol Status History
              </TabsTrigger>
              <TabsTrigger value="pushes" className="gap-1.5 px-3 text-xs">
                <Upload className="h-3 w-3" />
                Push History
              </TabsTrigger>
            </TabsList>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <TabsContent value="corrections" className="mt-0">
            <CorrectionHistoryTab onRetryCorrection={onRetryCorrection} />
          </TabsContent>
          <TabsContent value="polstatus" className="mt-0">
            <PolicyStatusHistoryTab />
          </TabsContent>
          <TabsContent value="pushes" className="mt-0">
            <PushHistoryTab />
          </TabsContent>
        </CardContent>
      </Tabs>
    </Card>
  );
}
