"use client";

import React, { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock,
  Loader2,
  RefreshCw,
  Search,
  Upload,
  Wrench,
  CheckCircle2,
  XCircle,
  Ban,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLogs, usePushLogs } from "@/queries/useCorrections";
import { usePolicyStatusLogs } from "@/queries/usePolicyStatus";
import { useSSE } from "@/hooks/useSSE";
import {
  CorrectionDetailDialog,
  PolicyStatusDetailDialog,
  PushDetailDialog,
  corrLabel,
  policyStatusLookupLabel,
  pushMethodLabel,
} from "@/components/dashboard/HistoryTable";

type HistoryTab = "corrections" | "polstatus" | "pushes";

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "completed":
      return (
        <Badge className="gap-1.5 border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="h-3 w-3" /> Done
        </Badge>
      );
    case "failed":
      return (
        <Badge className="gap-1.5 border-destructive/20 bg-destructive/10 text-destructive">
          <XCircle className="h-3 w-3" /> Failed
        </Badge>
      );
    case "cancelled":
      return (
        <Badge className="gap-1.5 border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400">
          <Ban className="h-3 w-3" /> Cancelled
        </Badge>
      );
    case "running":
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

function ChangeSummary({
  previousData,
  newData,
}: {
  previousData?: Record<string, string>;
  newData?: Record<string, string>;
}) {
  const count = useMemo(() => {
    if (!previousData || !newData) return 0;
    return Object.keys(newData).filter((key) => {
      const value = newData[key];
      return typeof value === "string" && value.trim().length > 0;
    }).length;
  }, [newData, previousData]);

  if (count === 0) return <span className="text-muted-foreground">-</span>;
  return <span className="text-xs text-muted-foreground">{count} field(s) updated</span>;
}

function PaginationControls({
  page,
  totalPages,
  hasPreviousPage,
  hasNextPage,
  isFetching,
  onPrevious,
  onNext,
}: {
  page: number;
  totalPages: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
  isFetching: boolean;
  onPrevious: () => void;
  onNext: () => void;
}) {
  return (
    <div className="mt-4 flex items-center justify-between gap-3">
      <Button
        variant="outline"
        size="sm"
        onClick={onPrevious}
        disabled={!hasPreviousPage || isFetching}
      >
        <ChevronLeft className="h-4 w-4" />
        Previous
      </Button>
      <span className="text-sm text-muted-foreground">
        Page {page} / {totalPages}
      </span>
      <Button
        variant="outline"
        size="sm"
        onClick={onNext}
        disabled={!hasNextPage || isFetching}
      >
        Next
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

export default function HistoryLogsPage() {
  const router = useRouter();
  useSSE();
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get("tab") as HistoryTab) || "corrections";
  const [tab, setTab] = useState<HistoryTab>(initialTab);

  const pageSize = 20;

  const [correctionPage, setCorrectionPage] = useState(1);
  const [correctionSearch, setCorrectionSearch] = useState("");
  const deferredCorrectionSearch = useDeferredValue(correctionSearch);
  const [selectedCorrection, setSelectedCorrection] = useState<any>(null);

  const [policyStatusPage, setPolicyStatusPage] = useState(1);
  const [policyStatusSearch, setPolicyStatusSearch] = useState("");
  const deferredPolicyStatusSearch = useDeferredValue(policyStatusSearch);
  const [selectedPolicyStatus, setSelectedPolicyStatus] = useState<any>(null);

  const [pushPage, setPushPage] = useState(1);
  const [pushSearch, setPushSearch] = useState("");
  const deferredPushSearch = useDeferredValue(pushSearch);
  const [selectedPush, setSelectedPush] = useState<any>(null);

  useEffect(() => {
    setCorrectionPage(1);
  }, [deferredCorrectionSearch]);

  useEffect(() => {
    setPolicyStatusPage(1);
  }, [deferredPolicyStatusSearch]);

  useEffect(() => {
    setPushPage(1);
  }, [deferredPushSearch]);

  const correctionsQuery = useLogs({
    page: correctionPage,
    pageSize,
    search: deferredCorrectionSearch,
  });
  const policyStatusQuery = usePolicyStatusLogs({
    page: policyStatusPage,
    pageSize,
    search: deferredPolicyStatusSearch,
  });
  const pushesQuery = usePushLogs({
    page: pushPage,
    pageSize,
    search: deferredPushSearch,
  });

  const correctionItems = correctionsQuery.data?.data?.items || [];
  const correctionPagination = correctionsQuery.data?.data?.pagination;
  const policyStatusItems = policyStatusQuery.data?.data?.items || [];
  const policyStatusPagination = policyStatusQuery.data?.data?.pagination;
  const pushItems = pushesQuery.data?.data?.items || [];
  const pushPagination = pushesQuery.data?.data?.pagination;

  function changeTab(nextTab: string) {
    const safeTab = nextTab as HistoryTab;
    setTab(safeTab);
    router.replace(`/history?tab=${safeTab}`);
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-[1200px] p-6 md:p-8">
        <header className="mb-8 flex flex-col gap-4 border-b border-border pb-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => router.push("/dashboard")}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="flex items-center gap-3 text-2xl font-bold tracking-tight">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <ClipboardList className="h-4 w-4" />
                </span>
                Full History
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Paginated correction, policy status, and push history with server-side search by policy number.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => router.push("/dashboard")}>
              Dashboard
            </Button>
            <ThemeToggle />
          </div>
        </header>

        <Card className="rounded-lg">
          <Tabs value={tab} onValueChange={changeTab}>
            <CardHeader>
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <CardTitle>History Browser</CardTitle>
                  <CardDescription>
                    Each tab loads only one page at a time to avoid lagging on large history sets.
                  </CardDescription>
                </div>
                <TabsList variant="line" className="h-8">
                  <TabsTrigger value="corrections" className="gap-1.5 px-3 text-xs">
                    <Wrench className="h-3 w-3" />
                    Corrections
                  </TabsTrigger>
                  <TabsTrigger value="polstatus" className="gap-1.5 px-3 text-xs">
                    <Search className="h-3 w-3" />
                    Pol Status
                  </TabsTrigger>
                  <TabsTrigger value="pushes" className="gap-1.5 px-3 text-xs">
                    <Upload className="h-3 w-3" />
                    Pushes
                  </TabsTrigger>
                </TabsList>
              </div>
            </CardHeader>

            <CardContent>
              <TabsContent value="corrections" className="mt-0">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="relative w-full md:max-w-sm">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={correctionSearch}
                      onChange={(event) => setCorrectionSearch(event.target.value)}
                      placeholder="Search by policy number"
                      className="pl-9"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{pageSize} per page</Badge>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => correctionsQuery.refetch()}
                      disabled={correctionsQuery.isFetching}
                    >
                      {correctionsQuery.isFetching ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4" />
                      )}
                      Refresh
                    </Button>
                  </div>
                </div>

                <p className="mt-3 text-sm text-muted-foreground">
                  Page {correctionPagination?.page || correctionPage} of {correctionPagination?.totalPages || 1}.{" "}
                  {correctionPagination?.total || 0} correction log(s).
                </p>

                <div className="mt-4 overflow-x-auto rounded-lg border border-border">
                  <Table>
                    <TableHeader className="bg-muted/50">
                      <TableRow>
                        <TableHead>Type</TableHead>
                        <TableHead>Policy Number</TableHead>
                        <TableHead>Changes</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-right">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {correctionItems.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                            No correction history found.
                          </TableCell>
                        </TableRow>
                      ) : (
                        correctionItems.map((item: any) => (
                          <TableRow
                            key={item.id}
                            className="cursor-pointer transition-colors hover:bg-accent/50"
                            onClick={() => setSelectedCorrection(item)}
                          >
                            <TableCell>
                              <Badge variant="secondary" className="font-mono text-[10px]">
                                {corrLabel(item.correction?.type)}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-medium">
                              {item.correction?.policyNumber || "-"}
                            </TableCell>
                            <TableCell>
                              <ChangeSummary
                                previousData={item.previousData}
                                newData={item.newData}
                              />
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {new Date(item.createdAt).toLocaleString()}
                            </TableCell>
                            <TableCell className="text-right">
                              <StatusBadge status={item.status} />
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>

                <PaginationControls
                  page={correctionPagination?.page || correctionPage}
                  totalPages={correctionPagination?.totalPages || 1}
                  hasPreviousPage={Boolean(correctionPagination?.hasPreviousPage)}
                  hasNextPage={Boolean(correctionPagination?.hasNextPage)}
                  isFetching={correctionsQuery.isFetching}
                  onPrevious={() => setCorrectionPage((current) => Math.max(1, current - 1))}
                  onNext={() => setCorrectionPage((current) => current + 1)}
                />
              </TabsContent>

              <TabsContent value="polstatus" className="mt-0">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="relative w-full md:max-w-sm">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={policyStatusSearch}
                      onChange={(event) => setPolicyStatusSearch(event.target.value)}
                      placeholder="Search by policy number"
                      className="pl-9"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{pageSize} per page</Badge>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => policyStatusQuery.refetch()}
                      disabled={policyStatusQuery.isFetching}
                    >
                      {policyStatusQuery.isFetching ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4" />
                      )}
                      Refresh
                    </Button>
                  </div>
                </div>

                <p className="mt-3 text-sm text-muted-foreground">
                  Page {policyStatusPagination?.page || policyStatusPage} of {policyStatusPagination?.totalPages || 1}.{" "}
                  {policyStatusPagination?.total || 0} policy status log(s).
                </p>

                <div className="mt-4 overflow-x-auto rounded-lg border border-border">
                  <Table>
                    <TableHeader className="bg-muted/50">
                      <TableRow>
                        <TableHead>Lookup</TableHead>
                        <TableHead>Value</TableHead>
                        <TableHead>Result</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-right">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {policyStatusItems.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                            No policy status history found.
                          </TableCell>
                        </TableRow>
                      ) : (
                        policyStatusItems.map((item: any) => (
                          <TableRow
                            key={item.id}
                            className="cursor-pointer transition-colors hover:bg-accent/50"
                            onClick={() => setSelectedPolicyStatus(item)}
                          >
                            <TableCell>
                              <Badge variant="secondary" className="font-mono text-[10px]">
                                {policyStatusLookupLabel(item.result?.lookupType || item.input?.lookupType)}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-medium">
                              {item.result?.lookupValue || item.input?.lookupValue || "-"}
                            </TableCell>
                            <TableCell className="max-w-[280px] text-xs text-muted-foreground">
                              {item.result?.message ? (
                                <span className="line-clamp-2">{item.result.message}</span>
                              ) : item.result?.summaryRows?.[0]?.response ? (
                                <span className="line-clamp-2">{item.result.summaryRows[0].response}</span>
                              ) : item.error ? (
                                <span className="line-clamp-2 text-destructive/80">{item.error}</span>
                              ) : (
                                <span>-</span>
                              )}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {new Date(item.createdAt).toLocaleString()}
                            </TableCell>
                            <TableCell className="text-right">
                              <StatusBadge status={item.status} />
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>

                <PaginationControls
                  page={policyStatusPagination?.page || policyStatusPage}
                  totalPages={policyStatusPagination?.totalPages || 1}
                  hasPreviousPage={Boolean(policyStatusPagination?.hasPreviousPage)}
                  hasNextPage={Boolean(policyStatusPagination?.hasNextPage)}
                  isFetching={policyStatusQuery.isFetching}
                  onPrevious={() => setPolicyStatusPage((current) => Math.max(1, current - 1))}
                  onNext={() => setPolicyStatusPage((current) => current + 1)}
                />
              </TabsContent>

              <TabsContent value="pushes" className="mt-0">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="relative w-full md:max-w-sm">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={pushSearch}
                      onChange={(event) => setPushSearch(event.target.value)}
                      placeholder="Search by policy number"
                      className="pl-9"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{pageSize} per page</Badge>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => pushesQuery.refetch()}
                      disabled={pushesQuery.isFetching}
                    >
                      {pushesQuery.isFetching ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4" />
                      )}
                      Refresh
                    </Button>
                  </div>
                </div>

                <p className="mt-3 text-sm text-muted-foreground">
                  Page {pushPagination?.page || pushPage} of {pushPagination?.totalPages || 1}.{" "}
                  {pushPagination?.total || 0} push log(s).
                </p>

                <div className="mt-4 overflow-x-auto rounded-lg border border-border">
                  <Table>
                    <TableHeader className="bg-muted/50">
                      <TableRow>
                        <TableHead>Method</TableHead>
                        <TableHead>Policy / Range</TableHead>
                        <TableHead>Result</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-right">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pushItems.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                            No push history found.
                          </TableCell>
                        </TableRow>
                      ) : (
                        pushItems.map((item: any) => (
                          <TableRow
                            key={item.id}
                            className="cursor-pointer transition-colors hover:bg-accent/50"
                            onClick={() => setSelectedPush(item)}
                          >
                            <TableCell>
                              <Badge variant="secondary" className="font-mono text-[10px]">
                                {pushMethodLabel(item.input?.method)}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-medium">
                              {item.input?.method === "date_range"
                                ? `${item.input?.fromDate} - ${item.input?.toDate}`
                                : item.input?.policyNumber || "-"}
                            </TableCell>
                            <TableCell className="max-w-[280px] text-xs text-muted-foreground">
                              {item.uploadResult ? (
                                <span className="line-clamp-2">{item.uploadResult}</span>
                              ) : item.error ? (
                                <span className="line-clamp-2 text-destructive/80">{item.error}</span>
                              ) : (
                                <span>-</span>
                              )}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {new Date(item.createdAt).toLocaleString()}
                            </TableCell>
                            <TableCell className="text-right">
                              <StatusBadge status={item.status} />
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>

                <PaginationControls
                  page={pushPagination?.page || pushPage}
                  totalPages={pushPagination?.totalPages || 1}
                  hasPreviousPage={Boolean(pushPagination?.hasPreviousPage)}
                  hasNextPage={Boolean(pushPagination?.hasNextPage)}
                  isFetching={pushesQuery.isFetching}
                  onPrevious={() => setPushPage((current) => Math.max(1, current - 1))}
                  onNext={() => setPushPage((current) => current + 1)}
                />
              </TabsContent>
            </CardContent>
          </Tabs>
        </Card>

        <CorrectionDetailDialog
          item={selectedCorrection}
          open={Boolean(selectedCorrection)}
          onOpenChange={(open) => !open && setSelectedCorrection(null)}
        />
        <PolicyStatusDetailDialog
          item={selectedPolicyStatus}
          open={Boolean(selectedPolicyStatus)}
          onOpenChange={(open) => !open && setSelectedPolicyStatus(null)}
        />
        <PushDetailDialog
          item={selectedPush}
          open={Boolean(selectedPush)}
          onOpenChange={(open) => !open && setSelectedPush(null)}
        />
      </div>
    </div>
  );
}
