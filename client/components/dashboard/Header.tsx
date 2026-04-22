import React from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useStatus, useLoginAG } from '@/queries/useSessions';
import { Bot, Zap, Settings } from 'lucide-react';
import { ThemeToggle } from '@/components/theme-toggle';

export function Header() {
  const router = useRouter();
  const { data: status } = useStatus();
  const loginMutation = useLoginAG();

  const sessions = status?.data?.sessions || { ag: { isActive: false }, niid: { isActive: false } };

  return (
    <header className="flex items-center justify-between mb-8 pb-6 border-b border-border">
      <div className="flex flex-col">
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center text-primary-foreground">
            <Zap className="w-4 h-4" />
          </div>
          A&G Policy Agent
        </h1>
        <p className="text-muted-foreground text-sm mt-1">Automated policy management system</p>
      </div>

      <div className="flex gap-3 items-center">
        <Badge
          variant="outline"
          className={`px-3 py-1.5 rounded-full cursor-pointer transition-all hover:border-muted-foreground flex items-center gap-2 bg-card ${sessions.ag?.isActive ? 'border-emerald-500/50 text-emerald-500 dark:text-emerald-400' : 'border-border text-muted-foreground'}`}
          onClick={() => loginMutation.mutate()}
        >
          <span className={`w-2 h-2 rounded-full ${sessions.ag?.isActive ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)] animate-pulse' : 'bg-muted-foreground/50'}`} />
          A&G {sessions.ag?.isActive ? 'Connected' : 'Offline'}
        </Badge>

        <Badge
          variant="outline"
          className={`px-3 py-1.5 rounded-full flex items-center gap-2 bg-card ${sessions.niid?.isActive ? 'border-emerald-500/50 text-emerald-500 dark:text-emerald-400' : 'border-border text-muted-foreground'}`}
        >
          <span className={`w-2 h-2 rounded-full ${sessions.niid?.isActive ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)] animate-pulse' : 'bg-muted-foreground/50'}`} />
          NIID {sessions.niid?.isActive ? 'Connected' : 'Offline'}
        </Badge>

        <Button
          variant="outline"
          size="sm"
          className="h-8 border-border bg-card"
          onClick={() => router.push('/automated-agent')}
        >
          <Bot className="h-4 w-4" />
          Automated Agent
        </Button>

        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8 border-border bg-card"
          onClick={() => router.push('/settings')}
          title="Settings"
        >
          <Settings className="h-4 w-4" />
        </Button>

        <ThemeToggle />
      </div>
    </header>
  );
}
