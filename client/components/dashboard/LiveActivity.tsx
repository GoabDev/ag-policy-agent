import React, { useRef, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RadioTower, Trash2 } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

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
    <Card className="bg-slate-900 border-slate-800 shadow-xl h-full flex flex-col">
      <CardHeader className="border-b border-slate-800 py-4 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <RadioTower className="w-4 h-4 text-blue-400" />
          Live Activity
        </CardTitle>
        <Button 
          variant="ghost" 
          size="sm" 
          className="h-8 w-8 p-0 text-slate-500 hover:text-slate-300"
          onClick={() => setLogs([])}
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </CardHeader>
      <CardContent className="flex-1 p-0 overflow-hidden">
        <ScrollArea className="h-[400px] w-full p-6" ref={scrollRef}>
          {logs.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-600 mt-20">
              <RadioTower className="w-12 h-12 mb-3 opacity-20" />
              <p className="text-sm">Waiting for activity...</p>
            </div>
          ) : (
            <div className="space-y-4">
              {logs.map((l) => (
                <div key={l.id} className="flex gap-4 items-start text-xs border-b border-slate-800/50 pb-3 last:border-0">
                  <span className="font-mono text-[10px] text-slate-500 whitespace-nowrap pt-0.5">{l.time}</span>
                  <span className="text-base leading-none">{l.icon}</span>
                  <span className="text-slate-300 leading-relaxed font-medium">{l.msg}</span>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
