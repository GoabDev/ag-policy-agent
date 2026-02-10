import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useLogs } from '@/queries/useCorrections';
import { ClipboardList, RefreshCw, CheckCircle2, XCircle, Clock } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from '@/components/ui/badge';

export function HistoryTable() {
  const { data: history, isLoading, refetch } = useLogs();

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 gap-1.5"><CheckCircle2 className="w-3 h-3" /> Done</Badge>;
      case 'failed':
        return <Badge className="bg-destructive/10 text-destructive border-destructive/20 gap-1.5"><XCircle className="w-3 h-3" /> Failed</Badge>;
      case 'running':
        return <Badge className="bg-primary/10 text-primary border-primary/20 gap-1.5"><RefreshCw className="w-3 h-3 animate-spin" /> Running</Badge>;
      default:
        return <Badge className="bg-muted text-muted-foreground border-border gap-1.5"><Clock className="w-3 h-3" /> Pending</Badge>;
    }
  };

  const corrLabel = (type: string) => {
    return { name: 'Name', registration: 'Reg No.', vehicle_make: 'Vehicle' }[type] || type;
  };

  return (
    <Card className="bg-card border-border shadow-xl lg:col-span-2">
      <CardHeader className="border-b border-border py-4 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <ClipboardList className="w-4 h-4 text-muted-foreground" />
          Correction History
        </CardTitle>
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
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow className="border-border">
                <TableHead className="text-muted-foreground text-[11px] uppercase font-bold tracking-wider">Type</TableHead>
                <TableHead className="text-muted-foreground text-[11px] uppercase font-bold tracking-wider">Policy Number</TableHead>
                <TableHead className="text-muted-foreground text-[11px] uppercase font-bold tracking-wider">Date</TableHead>
                <TableHead className="text-muted-foreground text-[11px] uppercase font-bold tracking-wider text-right">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history?.data?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="h-32 text-center text-muted-foreground">
                    No corrections yet
                  </TableCell>
                </TableRow>
              ) : (
                history?.data?.slice(0, 10).map((h: any) => (
                  <TableRow key={h.id} className="border-border hover:bg-accent/50 transition-colors">
                    <TableCell>
                      <Badge variant="secondary" className="bg-secondary text-secondary-foreground font-mono text-[10px]">
                        {corrLabel(h.correction?.type)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-foreground font-medium text-sm">
                      {h.correction?.policyNumber || '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-[11px]">
                      {new Date(h.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      {getStatusBadge(h.status)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
