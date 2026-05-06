import React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  useStatus,
  useLoginAG,
  useLoginEPIN,
  useLoginNIID,
  useLoginNIIP,
  useLoginEPINAll,
  useLoginNIIDPush,
  useLoginNIIDAll,
  useLoginAutomatedNIIDPush,
  useLoginAutomatedPushSessions,
  useKeepAlive,
  useStopAllSessions,
} from "@/queries/useSessions";
import { Lock, RefreshCw, Heart, Power } from "lucide-react";

interface SessionInfo {
  isActive: boolean;
  lastActivity?: string;
}

interface SessionMap {
  ag: SessionInfo;
  ag_push: SessionInfo;
  epin: SessionInfo;
  niid: SessionInfo;
  niip: SessionInfo;
  niid_push: SessionInfo;
  ag_auto_push: SessionInfo;
  niid_auto_push: SessionInfo;
}

interface SessionControlProps {
  mode?: "manual" | "automated";
}

const emptySessions: SessionMap = {
  ag: { isActive: false },
  ag_push: { isActive: false },
  epin: { isActive: false },
  niid: { isActive: false },
  niip: { isActive: false },
  niid_push: { isActive: false },
  ag_auto_push: { isActive: false },
  niid_auto_push: { isActive: false },
};

function StatusText({ active }: { active?: boolean }) {
  return active ? (
    <span className="text-emerald-500 dark:text-emerald-400">Active</span>
  ) : (
    <span className="text-muted-foreground">Inactive</span>
  );
}

export function SessionControl({ mode = "manual" }: SessionControlProps) {
  const { data: status } = useStatus();
  const sessions: SessionMap = status?.data?.sessions || emptySessions;
  const isAutomatedMode = mode === "automated";

  const loginAG = useLoginAG();
  const loginEPIN = useLoginEPIN();
  const loginNIID = useLoginNIID();
  const loginNIIP = useLoginNIIP();
  const loginEPINAll = useLoginEPINAll();
  const loginNIIDPush = useLoginNIIDPush();
  const loginNIIDAll = useLoginNIIDAll();
  const loginAutomatedPush = useLoginAutomatedPushSessions();
  const loginAutomatedNIIDPush = useLoginAutomatedNIIDPush();
  const keepAlive = useKeepAlive();
  const stopAll = useStopAllSessions();

  const anyNiidPending =
    loginNIID.isPending || loginNIIDPush.isPending || loginNIIDAll.isPending;
  const anyEpinPending =
    loginEPIN.isPending || loginNIIP.isPending || loginEPINAll.isPending;

  const stopAllSessions = () => {
    const confirmed = window.confirm(
      "Stop all sessions, close all browser windows, and clear saved session files?",
    );
    if (confirmed) stopAll.mutate();
  };

  return (
    <Card className="bg-card border-border shadow-xl lg:col-span-2">
      <CardHeader className="border-b border-border py-4">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Lock className="w-4 h-4 text-muted-foreground" />
          {isAutomatedMode ? "Automated Session Management" : "Session Management"}
        </CardTitle>
      </CardHeader>
      <CardContent
        className={
          isAutomatedMode
            ? "grid grid-cols-1 md:grid-cols-2 gap-6 p-6"
            : "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-6"
        }
      >
        {isAutomatedMode ? (
          <div className="p-5 bg-background border border-border rounded-xl">
            <h3 className="text-sm font-semibold mb-3">Automated Push</h3>
            <div className="text-xs text-muted-foreground mb-1">
              A&G Auto: <StatusText active={sessions.ag_auto_push?.isActive} />
            </div>
            <div className="text-xs text-muted-foreground mb-3">
              NIID Auto:{" "}
              <StatusText active={sessions.niid_auto_push?.isActive} />
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full text-xs mb-2"
              onClick={() => loginAutomatedPush.mutate()}
              disabled={loginAutomatedPush.isPending}
            >
              {loginAutomatedPush.isPending ? (
                <RefreshCw className="w-3 h-3 animate-spin mr-2" />
              ) : (
                <Lock className="w-3 h-3 mr-2" />
              )}
              Login Automated Push
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-[10px] h-7"
              onClick={() => loginAutomatedNIIDPush.mutate()}
              disabled={loginAutomatedNIIDPush.isPending}
            >
              NIID Auto Only
            </Button>
            <p className="text-[10px] text-muted-foreground mt-2 text-center">
              Required before starting Agent A or Agent B
            </p>
          </div>
        ) : (
          <>
            <div className="p-5 bg-background border border-border rounded-xl">
              <h3 className="text-sm font-semibold mb-3">A&G Platform</h3>
              <div className="text-xs text-muted-foreground mb-1">
                Status: <StatusText active={sessions.ag?.isActive} />
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
                onClick={() => loginAG.mutate()}
                disabled={loginAG.isPending}
              >
                {loginAG.isPending ? (
                  <RefreshCw className="w-3 h-3 animate-spin mr-2" />
                ) : (
                  <Lock className="w-3 h-3 mr-2" />
                )}
                {sessions.ag?.isActive ? "Refresh Session" : "Login"}
              </Button>
              <p className="text-[10px] text-muted-foreground mt-2 text-center">
                Auto-login - covers corrections + manual push
              </p>
            </div>

            <div className="p-5 bg-background border border-border rounded-xl">
              <h3 className="text-sm font-semibold mb-3">NIID</h3>
              <div className="text-xs text-muted-foreground mb-1">
                Corrections: <StatusText active={sessions.niid?.isActive} />
              </div>
              <div className="text-xs text-muted-foreground mb-1">
                Push: <StatusText active={sessions.niid_push?.isActive} />
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
                onClick={() => loginNIIDAll.mutate()}
                disabled={anyNiidPending}
              >
                {loginNIIDAll.isPending ? (
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
                  onClick={() => loginNIID.mutate()}
                  disabled={anyNiidPending}
                >
                  Corrections Only
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="flex-1 text-[10px] h-7"
                  onClick={() => loginNIIDPush.mutate()}
                  disabled={anyNiidPending}
                >
                  Push Only
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground mt-2 text-center">
                Manual login - opens browser popup(s)
              </p>
            </div>

            <div className="p-5 bg-background border border-border rounded-xl">
              <h3 className="text-sm font-semibold mb-3">E-PIN / NIIP</h3>
              <div className="text-xs text-muted-foreground mb-1">
                E-PIN: <StatusText active={sessions.epin?.isActive} />
              </div>
              <div className="text-xs text-muted-foreground mb-1">
                NIIP: <StatusText active={sessions.niip?.isActive} />
              </div>
              {sessions.epin?.lastActivity && (
                <div className="text-[10px] text-muted-foreground mb-3 italic">
                  Last activity:{" "}
                  {new Date(sessions.epin.lastActivity).toLocaleString()}
                </div>
              )}
              <Button
                variant="outline"
                size="sm"
                className="w-full text-xs mb-2"
                onClick={() => loginEPINAll.mutate()}
                disabled={anyEpinPending}
              >
                {loginEPINAll.isPending ? (
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
                  onClick={() => loginEPIN.mutate()}
                  disabled={anyEpinPending}
                >
                  E-PIN Only
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="flex-1 text-[10px] h-7"
                  onClick={() => loginNIIP.mutate()}
                  disabled={anyEpinPending}
                >
                  NIIP Only
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground mt-2 text-center">
                Auto-login for e-pin corrections
              </p>
            </div>
          </>
        )}

        <div className="p-5 bg-background border border-border rounded-xl">
          <h3 className="text-sm font-semibold mb-3">Session Controls</h3>
          <p className="text-[11px] text-muted-foreground mb-6 leading-relaxed">
            Heartbeats keep sessions alive by pinging the sites periodically to
            prevent timeout.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="w-full text-xs"
            onClick={() => keepAlive.mutate()}
            disabled={keepAlive.isPending}
          >
            {keepAlive.isPending ? (
              <RefreshCw className="w-3 h-3 animate-spin mr-2" />
            ) : (
              <Heart className="w-3 h-3 mr-2" />
            )}
            Start Heartbeats
          </Button>
          <Button
            variant="destructive"
            size="sm"
            className="w-full text-xs mt-3"
            onClick={stopAllSessions}
            disabled={stopAll.isPending}
          >
            {stopAll.isPending ? (
              <RefreshCw className="w-3 h-3 animate-spin mr-2" />
            ) : (
              <Power className="w-3 h-3 mr-2" />
            )}
            Stop All Sessions
          </Button>
          <p className="text-[10px] text-muted-foreground mt-2 text-center">
            Closes browsers and clears saved sessions
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
