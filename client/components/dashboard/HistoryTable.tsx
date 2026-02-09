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
        return <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 gap-1.5"><CheckCircle2 className="w-3 h-3" /> Done</Badge>;
      case 'failed':
        return <Badge className="bg-rose-500/10 text-rose-400 border-rose-500/20 gap-1.5"><XCircle className="w-3 h-3" /> Failed</Badge>;
      case 'running':
        return <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/20 gap-1.5"><RefreshCw className="w-3 h-3 animate-spin" /> Running</Badge>;
      default:
        return <Badge className="bg-slate-500/10 text-slate-400 border-slate-500/20 gap-1.5"><Clock className="w-3 h-3" /> Pending</Badge>;
    }
  };

  const corrLabel = (type: string) => {
    return { name: 'Name', registration: 'Reg No.', vehicle_make: 'Vehicle' }[type] || type;
  };

  return (
    <Card className="bg-slate-900 border-slate-800 shadow-xl lg:col-span-2">
      <CardHeader className="border-b border-slate-800 py-4 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <ClipboardList className="w-4 h-4 text-slate-400" />
          Correction History
        </CardTitle>
        <Button 
          variant="outline" 
          size="sm" 
          className="h-8 text-xs border-slate-700 hover:bg-slate-800"
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
            <TableHeader className="bg-slate-950/50">
              <TableRow className="border-slate-800">
                <TableHead className="text-slate-500 text-[11px] uppercase font-bold tracking-wider">Type</TableHead>
                <TableHead className="text-slate-500 text-[11px] uppercase font-bold tracking-wider">Policy Number</TableHead>
                <TableHead className="text-slate-500 text-[11px] uppercase font-bold tracking-wider">Date</TableHead>
                <TableHead className="text-slate-500 text-[11px] uppercase font-bold tracking-wider text-right">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history?.data?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="h-32 text-center text-slate-600">
                    No corrections yet
                  </TableCell>
                </TableRow>
              ) : (
                history?.data?.slice(0, 10).map((h: any) => (
                  <TableRow key={h.id} className="border-slate-800 hover:bg-slate-800/30 transition-colors">
                    <TableCell>
                      <Badge variant="secondary" className="bg-slate-800 text-slate-300 font-mono text-[10px]">
                        {corrLabel(h.correction?.type)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-slate-300 font-medium text-sm">
                      {h.correction?.policyNumber || '—'}
                    </TableCell>
                    <TableCell className="text-slate-500 text-[11px]">
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
