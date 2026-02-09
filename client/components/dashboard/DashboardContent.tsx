'use client';

import React from 'react';
import { Header } from './Header';
import { CorrectionForm } from './CorrectionForm';
import { LiveActivity } from './LiveActivity';
import { HistoryTable } from './HistoryTable';
import { SessionControl } from './SessionControl';
import { useSSE } from '@/hooks/useSSE';

export default function DashboardContent() {
  const { 
    logs, 
    setLogs, 
    steps, 
    isRunning, 
    error, 
    success, 
    addLog 
  } = useSSE();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 font-sans selection:bg-blue-500/30">
      <div className="max-w-[1200px] mx-auto p-6 md:p-8">
        <Header />
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          <div className="space-y-8">
            <CorrectionForm 
              isRunning={isRunning} 
              steps={steps} 
              error={error} 
              success={success} 
            />
          </div>
          
          <div className="space-y-8">
            <LiveActivity logs={logs} setLogs={setLogs} />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <HistoryTable />
          <SessionControl addLog={addLog} />
        </div>

        <footer className="mt-16 text-center text-slate-600 text-[10px] tracking-widest uppercase font-bold">
          A&G Insurance — Policy Correction Agent v1.0 • Built with Next.js & Shadcn/UI
        </footer>
      </div>
    </div>
  );
}
