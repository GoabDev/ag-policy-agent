import React, { useRef, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  RadioTower, Trash2, Rocket, CheckCircle2, XCircle, SkipForward,
  AlertTriangle, Info, LockKeyhole, HeartPulse
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { LucideIcon } from 'lucide-react';

const iconMap: Record<string, LucideIcon> = {
  'rocket': Rocket,
  'check-circle': CheckCircle2,
  'check-circle-2': CheckCircle2,
  'x-circle': XCircle,
  'skip-forward': SkipForward,
  'alert-triangle': AlertTriangle,
  'info': Info,
  'lock-keyhole': LockKeyhole,
  'heart-pulse': HeartPulse,
};

function LogIcon({ name }: { name: string }) {
  const Icon = iconMap[name];
  if (!Icon) return <Info className="w-4 h-4 text-muted-foreground" />;

  const colorClass =
    name === 'x-circle' ? 'text-destructive' :
    name === 'check-circle' || name === 'check-circle-2' ? 'text-emerald-500' :
    name === 'alert-triangle' ? 'text-amber-500' :
    name === 'rocket' ? 'text-primary' :
    'text-muted-foreground';

  return <Icon className={`w-4 h-4 ${colorClass}`} />;
}

export function LiveActivity({ logs, setLogs }: { logs: any[], setLogs: (logs: any[]) => void }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      const scrollContainer = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [logs]);

  return (
    <Card className="bg-card border-border shadow-xl h-full flex flex-col">
      <CardHeader className="border-b border-border py-4 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <RadioTower className="w-4 h-4 text-primary" />
          Live Activity
        </CardTitle>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
          onClick={() => setLogs([])}
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </CardHeader>
      <CardContent className="flex-1 p-0 overflow-hidden">
        <ScrollArea className="h-[400px] w-full p-6" ref={scrollRef}>
          {logs.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground mt-20">
              <RadioTower className="w-12 h-12 mb-3 opacity-20" />
              <p className="text-sm">Waiting for activity...</p>
            </div>
          ) : (
            <div className="space-y-4">
              {logs.map((l) => (
                <div key={l.id} className="flex gap-4 items-start text-xs border-b border-border/50 pb-3 last:border-0">
                  <span className="font-mono text-[10px] text-muted-foreground whitespace-nowrap pt-0.5">{l.time}</span>
                  <LogIcon name={l.icon} />
                  <span className="text-foreground/80 leading-relaxed font-medium">{l.msg}</span>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
