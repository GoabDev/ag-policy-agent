import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useStatus, useLoginAG, useKeepAlive } from '@/queries/useSessions';
import { AlertCircle, Lock, RefreshCw, Heart } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export function SessionControl({ addLog }: { addLog: (icon: string, msg: string) => void }) {
  const { data: status } = useStatus();
  const loginMutation = useLoginAG();
  const keepAliveMutation = useKeepAlive();

  const sessions = status?.data?.sessions || { ag: { isActive: false }, niid: { isActive: false } };

  const handleLoginAG = () => {
    loginMutation.mutate(undefined, {
      onSuccess: () => addLog('🔐', 'A&G login initiated'),
    });
  };

  const handleKeepAlive = () => {
    keepAliveMutation.mutate(undefined, {
      onSuccess: () => addLog('💓', 'Heartbeats started'),
    });
  };

  return (
    <Card className="bg-slate-900 border-slate-800 shadow-xl lg:col-span-2">
      <CardHeader className="border-b border-slate-800 py-4">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Lock className="w-4 h-4 text-slate-400" />
          Session Management
        </CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-6 p-6">
        {/* A&G Platform */}
        <div className="p-5 bg-slate-950 border border-slate-800 rounded-xl">
          <h3 className="text-sm font-semibold mb-3">A&G Platform</h3>
          <div className="text-xs text-slate-400 mb-1">
            Status: {sessions.ag?.isActive ? <span className="text-emerald-400">Active</span> : <span className="text-slate-500">Inactive</span>}
          </div>
          {sessions.ag?.lastActivity && (
            <div className="text-[10px] text-slate-500 mb-4 italic">
              Last activity: {new Date(sessions.ag.lastActivity).toLocaleString()}
            </div>
          )}
          <Button 
            variant="outline" 
            size="sm" 
            className="w-full text-xs" 
            onClick={handleLoginAG}
            disabled={loginMutation.isPending}
          >
            {loginMutation.isPending ? <RefreshCw className="w-3 h-3 animate-spin mr-2" /> : <Lock className="w-3 h-3 mr-2" />}
            {sessions.ag?.isActive ? 'Refresh Session' : 'Login'}
          </Button>
          <p className="text-[10px] text-slate-500 mt-2 text-center">Auto-login (no captcha needed)</p>
        </div>

        {/* NIID */}
        <div className="p-5 bg-slate-950 border border-slate-800 rounded-xl">
          <h3 className="text-sm font-semibold mb-3">NIID</h3>
          <div className="text-xs text-slate-400 mb-1">
            Status: {sessions.niid?.isActive ? <span className="text-emerald-400">Active</span> : <span className="text-slate-500">Inactive</span>}
          </div>
          {sessions.niid?.lastActivity && (
            <div className="text-[10px] text-slate-500 mb-4 italic">
              Last activity: {new Date(sessions.niid.lastActivity).toLocaleString()}
            </div>
          )}
          <Alert variant="destructive" className="bg-amber-950/20 border-amber-500/20 p-3 mt-1">
            <AlertCircle className="h-4 w-4 text-amber-500" />
            <AlertDescription className="text-[10px] text-amber-200 leading-tight">
              NIID requires manual login. Run this in your terminal:
              <code className="block mt-1 font-mono text-[10px] bg-black/40 p-1 px-2 rounded border border-amber-500/10">
                npm run login:niid
              </code>
            </AlertDescription>
          </Alert>
        </div>

        {/* Keep-Alive */}
        <div className="p-5 bg-slate-950 border border-slate-800 rounded-xl">
          <h3 className="text-sm font-semibold mb-3">Keep-Alive</h3>
          <p className="text-[11px] text-slate-400 mb-6 leading-relaxed">
            Heartbeats keep sessions alive by pinging the sites periodically to prevent timeout.
          </p>
          <Button 
            variant="outline" 
            size="sm" 
            className="w-full text-xs" 
            onClick={handleKeepAlive}
            disabled={keepAliveMutation.isPending}
          >
            {keepAliveMutation.isPending ? <RefreshCw className="w-3 h-3 animate-spin mr-2" /> : <Heart className="w-3 h-3 mr-2" />}
            Start Heartbeats
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
