import { useEffect, useState, useCallback } from 'react';

export function useSSE() {
  const [logs, setLogs] = useState<any[]>([]);
  const [steps, setSteps] = useState<any[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const addLog = useCallback((icon: string, msg: string, time: string = new Date().toLocaleTimeString()) => {
    setLogs((prev) => [...prev.slice(-99), { icon, msg, time, id: Date.now() + Math.random() }]);
  }, []);

  useEffect(() => {
    const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    let sse: EventSource;

    try {
      sse = new EventSource(`${apiBase}/api/stream`);

      sse.onmessage = (e) => {
        const ev = JSON.parse(e.data);
        const time = new Date(ev.timestamp || Date.now()).toLocaleTimeString();

        if (ev.type === 'task:started') {
          setIsRunning(true);
          setSteps([]);
          setError(null);
          setSuccess(null);
          addLog('🚀', `Task started: ${ev.data?.type || ''} correction`, time);
        } else if (ev.type === 'task:step') {
          const s = ev.data?.step;
          if (s) {
            setSteps((prev) => [...prev, s]);
            const icon = s.status === 'success' ? '✅' : s.status === 'failed' ? '❌' : '⏭️';
            addLog(icon, `[${s.site.toUpperCase()}] ${s.action}`, time);
          }
        } else if (ev.type === 'task:completed') {
          setIsRunning(false);
          setSuccess('Correction completed successfully!');
          addLog('🎉', 'Task completed', time);
        } else if (ev.type === 'task:failed') {
          setIsRunning(false);
          setError(ev.data?.error || 'Task failed');
          addLog('❌', `Task failed: ${ev.data?.error || ''}`, time);
        } else if (ev.type === 'log') {
          const d = ev.data;
          const icon = d?.level === 'error' ? '❌' : d?.level === 'warn' ? '⚠️' : 'ℹ️';
          addLog(icon, d?.message || '', time);
        }
      };

      sse.onerror = () => {
        // addLog('⚠️', 'Connection lost — retrying...');
      };
    } catch (err) {
      console.error('SSE Error:', err);
    }

    return () => {
      if (sse) sse.close();
    };
  }, [addLog]);

  return { logs, setLogs, steps, setSteps, isRunning, setIsRunning, error, setError, success, setSuccess, addLog };
}
