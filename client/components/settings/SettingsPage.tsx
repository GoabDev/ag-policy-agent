"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  useSettings,
  useUpdateSettings,
  useCleanLogs,
  useLogStats,
} from "@/queries/useSettings";
import {
  ArrowLeft,
  Monitor,
  Trash2,
  Clock,
  Users,
  Heart,
  Bell,
  Save,
  Loader2,
  Info,
  Zap,
} from "lucide-react";

interface Settings {
  headless: boolean;
  logRetentionDays: number;
  autoStartSessions: boolean;
  sessionTimeoutHours: number;
  maxWorkers: number;
  agKeepAliveMinutes: number;
  niidKeepAliveMinutes: number;
  notifications: "all" | "errors" | "none";
}

const DEFAULTS: Settings = {
  headless: true,
  logRetentionDays: 30,
  autoStartSessions: false,
  sessionTimeoutHours: 5,
  maxWorkers: 5,
  agKeepAliveMinutes: 5,
  niidKeepAliveMinutes: 2,
  notifications: "all",
};

export default function SettingsPage() {
  const router = useRouter();
  const { data: settingsRes, isLoading } = useSettings();
  const updateMutation = useUpdateSettings();
  const cleanMutation = useCleanLogs();
  const { data: logStatsRes } = useLogStats();

  const [form, setForm] = useState<Settings>(DEFAULTS);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (settingsRes?.data) {
      setForm({ ...DEFAULTS, ...settingsRes.data });
    }
  }, [settingsRes]);

  const logStats = logStatsRes?.data;

  function update(partial: Partial<Settings>) {
    setForm((prev) => ({ ...prev, ...partial }));
    setDirty(true);
  }

  function handleSave() {
    updateMutation.mutate(form, {
      onSuccess: () => setDirty(false),
    });
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground font-sans selection:bg-primary/20">
      <div className="max-w-[800px] mx-auto p-6 md:p-8">
        <header className="flex items-center justify-between mb-8 pb-6 border-b border-border">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => router.push("/dashboard")}
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold tracking-tight flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center text-primary-foreground">
                  <Zap className="w-4 h-4" />
                </div>
                Settings
              </h1>
              <p className="text-muted-foreground text-sm mt-1">
                Configure your automation preferences
              </p>
            </div>
          </div>
          <ThemeToggle />
        </header>

        <div className="space-y-6">
          <Card className="bg-card border-border shadow-xl">
            <CardHeader className="border-b border-border py-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Monitor className="w-4 h-4 text-muted-foreground" />
                Automation
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-medium">
                    Show browser during automation
                  </Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    When enabled, you can watch the automation process in a
                    visible browser window
                  </p>
                </div>
                <Switch
                  checked={!form.headless}
                  onCheckedChange={(checked) => update({ headless: !checked })}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-medium">
                    Max concurrent workers
                  </Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    Number of browser instances that can run simultaneously
                  </p>
                </div>
                <Select
                  value={String(form.maxWorkers)}
                  onValueChange={(v) => update({ maxWorkers: parseInt(v) })}
                >
                  <SelectTrigger className="w-20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5, 6, 8, 10].map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card border-border shadow-xl">
            <CardHeader className="border-b border-border py-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Trash2 className="w-4 h-4 text-muted-foreground" />
                Log Management
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-medium">
                    Auto-delete logs after
                  </Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    Automatically remove log files older than this period
                  </p>
                </div>
                <Select
                  value={String(form.logRetentionDays)}
                  onValueChange={(v) =>
                    update({ logRetentionDays: parseInt(v) })
                  }
                >
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">7 days</SelectItem>
                    <SelectItem value="14">14 days</SelectItem>
                    <SelectItem value="30">30 days</SelectItem>
                    <SelectItem value="60">60 days</SelectItem>
                    <SelectItem value="90">90 days</SelectItem>
                    <SelectItem value="365">1 year</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between p-4 bg-background border border-border rounded-xl">
                <div>
                  <p className="text-sm font-medium">
                    {logStats?.total ?? "..."} total log files
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {logStats?.cleanable ?? 0} files eligible for cleanup
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={() => cleanMutation.mutate()}
                  disabled={
                    cleanMutation.isPending || (logStats?.cleanable ?? 0) === 0
                  }
                >
                  {cleanMutation.isPending ? (
                    <Loader2 className="w-3 h-3 animate-spin mr-2" />
                  ) : (
                    <Trash2 className="w-3 h-3 mr-2" />
                  )}
                  Clean Now
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card border-border shadow-xl">
            <CardHeader className="border-b border-border py-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Clock className="w-4 h-4 text-muted-foreground" />
                Sessions
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-medium">
                    Auto-start sessions on launch
                  </Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    Automatically connect to A&G when the app starts
                  </p>
                </div>
                <Switch
                  checked={form.autoStartSessions}
                  onCheckedChange={(checked) =>
                    update({ autoStartSessions: checked })
                  }
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-medium">
                    Session inactivity timeout
                  </Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    Auto-close sessions after this period of inactivity
                  </p>
                </div>
                <Select
                  value={String(form.sessionTimeoutHours)}
                  onValueChange={(v) =>
                    update({ sessionTimeoutHours: parseInt(v) })
                  }
                >
                  <SelectTrigger className="w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 hour</SelectItem>
                    <SelectItem value="2">2 hours</SelectItem>
                    <SelectItem value="3">3 hours</SelectItem>
                    <SelectItem value="5">5 hours</SelectItem>
                    <SelectItem value="8">8 hours</SelectItem>
                    <SelectItem value="12">12 hours</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card border-border shadow-xl opacity-60">
            <CardHeader className="border-b border-border py-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Heart className="w-4 h-4 text-muted-foreground" />
                Keep-Alive Intervals
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              <div className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-700 dark:text-amber-300">
                <Info className="w-4 h-4 shrink-0" />
                <p className="text-xs">
                  These values are locked because A&G and NIID have fixed
                  session limits. Changing them may cause sessions to expire
                  unexpectedly.
                </p>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">
                    A&G keep-alive interval
                  </Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    Currently: every {form.agKeepAliveMinutes} minutes
                  </p>
                </div>
                <Select disabled value={String(form.agKeepAliveMinutes)}>
                  <SelectTrigger className="w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={String(form.agKeepAliveMinutes)}>
                      {form.agKeepAliveMinutes} min
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">
                    NIID keep-alive interval
                  </Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    Currently: every {form.niidKeepAliveMinutes} minutes
                  </p>
                </div>
                <Select disabled value={String(form.niidKeepAliveMinutes)}>
                  <SelectTrigger className="w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={String(form.niidKeepAliveMinutes)}>
                      {form.niidKeepAliveMinutes} min
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card border-border shadow-xl">
            <CardHeader className="border-b border-border py-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Bell className="w-4 h-4 text-muted-foreground" />
                Notifications
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-medium">
                    Toast notifications
                  </Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    Control which notifications appear during automation
                  </p>
                </div>
                <Select
                  value={form.notifications}
                  onValueChange={(v) =>
                    update({
                      notifications: v as "all" | "errors" | "none",
                    })
                  }
                >
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="errors">Errors only</SelectItem>
                    <SelectItem value="none">None</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card border-border shadow-xl">
            <CardHeader className="border-b border-border py-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Monitor className="w-4 h-4 text-muted-foreground" />
                Appearance
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-medium">Theme</Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    Switch between dark, light, or system theme
                  </p>
                </div>
                <ThemeToggle />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="mt-8 flex justify-end">
          <Button
            onClick={handleSave}
            disabled={!dirty || updateMutation.isPending}
            className="px-8"
          >
            {updateMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            Save Settings
          </Button>
        </div>

        <footer className="mt-16 text-center text-muted-foreground text-[10px] tracking-widest uppercase font-bold">
          A&G Insurance - Policy Agent v2.1.2
        </footer>
      </div>
    </div>
  );
}
