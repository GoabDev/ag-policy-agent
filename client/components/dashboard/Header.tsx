import React from 'react';
import { Badge } from '@/components/ui/badge';
import { useStatus, useLoginAG } from '@/queries/useSessions';

export function Header() {
  const { data: status } = useStatus();
  const loginMutation = useLoginAG();

  const sessions = status?.data?.sessions || { ag: { isActive: false }, niid: { isActive: false } };

  return (
    <header className="flex items-center justify-between mb-8 pb-6 border-b border-slate-800">
      <div className="flex flex-col">
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-base">
            ⚡
          </div>
          A&G Correction Agent
        </h1>
        <p className="text-slate-400 text-sm mt-1">Automated policy correction system</p>
      </div>

      <div className="flex gap-3">
        <Badge 
          variant="outline" 
          className={`px-3 py-1.5 rounded-full cursor-pointer transition-all hover:border-slate-600 flex items-center gap-2 bg-slate-900 ${sessions.ag?.isActive ? 'border-emerald-500/50 text-emerald-400' : 'border-slate-700 text-slate-400'}`}
          onClick={() => loginMutation.mutate()}
        >
          <span className={`w-2 h-2 rounded-full ${sessions.ag?.isActive ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)] animate-pulse' : 'bg-slate-500'}`} />
          A&G {sessions.ag?.isActive ? 'Connected' : 'Offline'}
        </Badge>

        <Badge 
          variant="outline" 
          className={`px-3 py-1.5 rounded-full flex items-center gap-2 bg-slate-900 ${sessions.niid?.isActive ? 'border-emerald-500/50 text-emerald-400' : 'border-slate-700 text-slate-400'}`}
        >
          <span className={`w-2 h-2 rounded-full ${sessions.niid?.isActive ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)] animate-pulse' : 'bg-slate-500'}`} />
          NIID {sessions.niid?.isActive ? 'Connected' : 'Offline'}
        </Badge>
      </div>
    </header>
  );
}
