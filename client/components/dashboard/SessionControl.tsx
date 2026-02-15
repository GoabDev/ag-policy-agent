import React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  useStatus,
  useLoginAG,
  useLoginNIID,
  useLoginNIIDPush,
  useLoginNIIDAll,
  useKeepAlive,
} from "@/queries/useSessions";
import { Lock, RefreshCw, Heart } from "lucide-react";

export function SessionControl() {
  const { data: status } = useStatus();
  const loginMutation = useLoginAG();
  const niidLoginMutation = useLoginNIID();
  const niidPushLoginMutation = useLoginNIIDPush();
  const niidAllLoginMutation = useLoginNIIDAll();
  const keepAliveMutation = useKeepAlive();

  const sessions = status?.data?.sessions || {
    ag: { isActive: false },
    ag_push: { isActive: false },
    niid: { isActive: false },
    niid_push: { isActive: false },
  };
  const anyNiidPending =
    niidLoginMutation.isPending ||
    niidPushLoginMutation.isPending ||
    niidAllLoginMutation.isPending;

  return (
    <Card className="bg-card border-border shadow-xl lg:col-span-2">
      <CardHeader className="border-b border-border py-4">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Lock className="w-4 h-4 text-muted-foreground" />
          Session Management
        </CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-6">
        {/* A&G Platform (covers both corrections and push) */}
        <div className="p-5 bg-background border border-border rounded-xl">
          <h3 className="text-sm font-semibold mb-3">A&G Platform</h3>
          <div className="text-xs text-muted-foreground mb-1">
            Status:{" "}
            {sessions.ag?.isActive ? (
              <span className="text-emerald-500 dark:text-emerald-400">
                Active
              </span>
            ) : (
              <span className="text-muted-foreground">Inactive</span>
            )}
          </div>
          {sessions.ag?.lastActivity && (
            <div className="text-[10px] text-muted-foreground mb-4 italic">
              Last activity:{" "}
              {new Date(sessions.ag.lastActivity).toLocaleString()}
            </div>
          )}
          <Button
            variant="outline"
            size="sm"
            className="w-full text-xs"
            onClick={() => loginMutation.mutate()}
            disabled={loginMutation.isPending}
          >
            {loginMutation.isPending ? (
              <RefreshCw className="w-3 h-3 animate-spin mr-2" />
            ) : (
              <Lock className="w-3 h-3 mr-2" />
            )}
            {sessions.ag?.isActive ? "Refresh Session" : "Login"}
          </Button>
          <p className="text-[10px] text-muted-foreground mt-2 text-center">
            Auto-login — covers corrections + push
          </p>
        </div>

        {/* NIID (corrections + push) */}
        <div className="p-5 bg-background border border-border rounded-xl">
          <h3 className="text-sm font-semibold mb-3">NIID</h3>
          <div className="text-xs text-muted-foreground mb-1">
            Corrections:{" "}
            {sessions.niid?.isActive ? (
              <span className="text-emerald-500 dark:text-emerald-400">
                Active
              </span>
            ) : (
              <span className="text-muted-foreground">Inactive</span>
            )}
          </div>
          <div className="text-xs text-muted-foreground mb-1">
            Push:{" "}
            {(sessions as any).niid_push?.isActive ? (
              <span className="text-emerald-500 dark:text-emerald-400">
                Active
              </span>
            ) : (
              <span className="text-muted-foreground">Inactive</span>
            )}
          </div>
          {sessions.niid?.lastActivity && (
            <div className="text-[10px] text-muted-foreground mb-3 italic">
              Last activity:{" "}
              {new Date(sessions.niid.lastActivity).toLocaleString()}
            </div>
          )}
          <Button
            variant="outline"
            size="sm"
            className="w-full text-xs mb-2"
            onClick={() => niidAllLoginMutation.mutate()}
            disabled={anyNiidPending}
          >
            {niidAllLoginMutation.isPending ? (
              <RefreshCw className="w-3 h-3 animate-spin mr-2" />
            ) : (
              <Lock className="w-3 h-3 mr-2" />
            )}
            Login Both
          </Button>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="flex-1 text-[10px] h-7"
              onClick={() => niidLoginMutation.mutate()}
              disabled={anyNiidPending}
            >
              Corrections Only
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="flex-1 text-[10px] h-7"
              onClick={() => niidPushLoginMutation.mutate()}
              disabled={anyNiidPending}
            >
              Push Only
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-2 text-center">
            Manual login — opens browser popup(s)
          </p>
        </div>

        {/* Keep-Alive */}
        <div className="p-5 bg-background border border-border rounded-xl">
          <h3 className="text-sm font-semibold mb-3">Keep-Alive</h3>
          <p className="text-[11px] text-muted-foreground mb-6 leading-relaxed">
            Heartbeats keep sessions alive by pinging the sites periodically to
            prevent timeout.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="w-full text-xs"
            onClick={() => keepAliveMutation.mutate()}
            disabled={keepAliveMutation.isPending}
          >
            {keepAliveMutation.isPending ? (
              <RefreshCw className="w-3 h-3 animate-spin mr-2" />
            ) : (
              <Heart className="w-3 h-3 mr-2" />
            )}
            Start Heartbeats
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
