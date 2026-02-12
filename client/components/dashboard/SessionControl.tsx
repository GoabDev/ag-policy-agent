import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useStatus, useLoginAG, useLoginNIID, useLoginNIIDPush, useKeepAlive } from '@/queries/useSessions';
import { Lock, RefreshCw, Heart } from 'lucide-react';

export function SessionControl({ addLog }: { addLog: (icon: string, msg: string) => void }) {
  const { data: status } = useStatus();
  const loginMutation = useLoginAG();
  const niidLoginMutation = useLoginNIID();
  const niidPushLoginMutation = useLoginNIIDPush();
  const keepAliveMutation = useKeepAlive();

  const sessions = status?.data?.sessions || { ag: { isActive: false }, niid: { isActive: false }, niid_push: { isActive: false } };

  const handleLoginAG = () => {
    loginMutation.mutate(undefined, {
      onSuccess: () => addLog('lock-keyhole', 'A&G login initiated'),
    });
  };

  const handleLoginNIID = () => {
    niidLoginMutation.mutate(undefined, {
      onSuccess: () => addLog('lock-keyhole', 'NIID login popup opened — complete login in the browser window'),
    });
  };

  const handleLoginNIIDPush = () => {
    niidPushLoginMutation.mutate(undefined, {
      onSuccess: () => addLog('lock-keyhole', 'NIID Push login popup opened — complete login in the browser window'),
    });
  };

  const handleKeepAlive = () => {
    keepAliveMutation.mutate(undefined, {
      onSuccess: () => addLog('heart-pulse', 'Heartbeats started'),
    });
  };

  return (
    <Card className="bg-card border-border shadow-xl lg:col-span-2">
      <CardHeader className="border-b border-border py-4">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Lock className="w-4 h-4 text-muted-foreground" />
          Session Management
        </CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 p-6">
        {/* A&G Platform */}
        <div className="p-5 bg-background border border-border rounded-xl">
          <h3 className="text-sm font-semibold mb-3">A&G Platform</h3>
          <div className="text-xs text-muted-foreground mb-1">
            Status: {sessions.ag?.isActive ? <span className="text-emerald-500 dark:text-emerald-400">Active</span> : <span className="text-muted-foreground">Inactive</span>}
          </div>
          {sessions.ag?.lastActivity && (
            <div className="text-[10px] text-muted-foreground mb-4 italic">
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
          <p className="text-[10px] text-muted-foreground mt-2 text-center">Auto-login (no captcha needed)</p>
        </div>

        {/* NIID */}
        <div className="p-5 bg-background border border-border rounded-xl">
          <h3 className="text-sm font-semibold mb-3">NIID</h3>
          <div className="text-xs text-muted-foreground mb-1">
            Status: {sessions.niid?.isActive ? <span className="text-emerald-500 dark:text-emerald-400">Active</span> : <span className="text-muted-foreground">Inactive</span>}
          </div>
          {sessions.niid?.lastActivity && (
            <div className="text-[10px] text-muted-foreground mb-4 italic">
              Last activity: {new Date(sessions.niid.lastActivity).toLocaleString()}
            </div>
          )}
          <Button
            variant="outline"
            size="sm"
            className="w-full text-xs"
            onClick={handleLoginNIID}
            disabled={niidLoginMutation.isPending}
          >
            {niidLoginMutation.isPending ? <RefreshCw className="w-3 h-3 animate-spin mr-2" /> : <Lock className="w-3 h-3 mr-2" />}
            {sessions.niid?.isActive ? 'Refresh Session' : 'Login'}
          </Button>
          <p className="text-[10px] text-muted-foreground mt-2 text-center">Opens a browser popup for manual login (CAPTCHA)</p>
        </div>

        {/* NIID Push */}
        <div className="p-5 bg-background border border-border rounded-xl">
          <h3 className="text-sm font-semibold mb-3">NIID Push</h3>
          <div className="text-xs text-muted-foreground mb-1">
            Status: {(sessions as any).niid_push?.isActive ? <span className="text-emerald-500 dark:text-emerald-400">Active</span> : <span className="text-muted-foreground">Inactive</span>}
          </div>
          {(sessions as any).niid_push?.lastActivity && (
            <div className="text-[10px] text-muted-foreground mb-4 italic">
              Last activity: {new Date((sessions as any).niid_push.lastActivity).toLocaleString()}
            </div>
          )}
          <Button
            variant="outline"
            size="sm"
            className="w-full text-xs"
            onClick={handleLoginNIIDPush}
            disabled={niidPushLoginMutation.isPending}
          >
            {niidPushLoginMutation.isPending ? <RefreshCw className="w-3 h-3 animate-spin mr-2" /> : <Lock className="w-3 h-3 mr-2" />}
            {(sessions as any).niid_push?.isActive ? 'Refresh Session' : 'Login'}
          </Button>
          <p className="text-[10px] text-muted-foreground mt-2 text-center">Separate session for policy uploads (CAPTCHA)</p>
        </div>

        {/* Keep-Alive */}
        <div className="p-5 bg-background border border-border rounded-xl">
          <h3 className="text-sm font-semibold mb-3">Keep-Alive</h3>
          <p className="text-[11px] text-muted-foreground mb-6 leading-relaxed">
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
