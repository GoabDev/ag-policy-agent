import { useEffect, useState, useCallback } from 'react';

export interface TaskState {
  id: string;
  type: string;
  policyNumber?: string;
  steps: any[];
  status: 'running' | 'completed' | 'failed';
  error?: string;
}

export function useSSE() {
  const [logs, setLogs] = useState<any[]>([]);
  const [tasks, setTasks] = useState<Map<string, TaskState>>(new Map());

  const addLog = useCallback((icon: string, msg: string, time: string = new Date().toLocaleTimeString()) => {
    setLogs((prev) => [...prev.slice(-99), { icon, msg, time, id: Date.now() + Math.random() }]);
  }, []);

  // Derived state
  const activeTasks = Array.from(tasks.values()).filter(t => t.status === 'running');
  const isRunning = activeTasks.length > 0;

  useEffect(() => {
    let sse: EventSource;

    try {
      sse = new EventSource(`/api/stream`);

      sse.onmessage = (e) => {
        const ev = JSON.parse(e.data);
        const time = new Date(ev.timestamp || Date.now()).toLocaleTimeString();
        const taskId = ev.data?.taskId;

        if (ev.type === 'task:started' && taskId) {
          setTasks((prev) => {
            const next = new Map(prev);
            next.set(taskId, {
              id: taskId,
              type: ev.data?.type || '',
              policyNumber: ev.data?.policyNumber || '',
              steps: [],
              status: 'running',
            });
            return next;
          });
          addLog('rocket', `Task started: ${ev.data?.type || ''} correction (${ev.data?.policyNumber || ''})`, time);

        } else if (ev.type === 'task:step' && taskId) {
          const s = ev.data?.step;
          if (s) {
            setTasks((prev) => {
              const next = new Map(prev);
              const task = next.get(taskId);
              if (task) {
                next.set(taskId, { ...task, steps: [...task.steps, s] });
              }
              return next;
            });
            const icon = s.status === 'success' ? 'check-circle' : s.status === 'failed' ? 'x-circle' : 'skip-forward';
            addLog(icon, `[${s.site.toUpperCase()}] ${s.action}`, time);
          }

        } else if (ev.type === 'task:completed' && taskId) {
          setTasks((prev) => {
            const next = new Map(prev);
            const task = next.get(taskId);
            if (task) {
              next.set(taskId, { ...task, status: 'completed' });
            }
            return next;
          });
          addLog('check-circle-2', 'Task completed', time);

        } else if (ev.type === 'task:failed' && taskId) {
          setTasks((prev) => {
            const next = new Map(prev);
            const task = next.get(taskId);
            if (task) {
              next.set(taskId, { ...task, status: 'failed', error: ev.data?.error });
            }
            return next;
          });
          addLog('x-circle', `Task failed: ${ev.data?.error || ''}`, time);

        } else if (ev.type === 'push:started' && taskId) {
          setTasks((prev) => {
            const next = new Map(prev);
            next.set(taskId, {
              id: taskId,
              type: 'policy_push',
              policyNumber: ev.data?.label || '',
              steps: [],
              status: 'running',
            });
            return next;
          });
          addLog('rocket', `Policy push started: ${ev.data?.label || ''}`, time);

        } else if (ev.type === 'push:step' && taskId) {
          const s = ev.data?.step;
          if (s) {
            setTasks((prev) => {
              const next = new Map(prev);
              const task = next.get(taskId);
              if (task) {
                next.set(taskId, { ...task, steps: [...task.steps, s] });
              }
              return next;
            });
            const icon = s.status === 'success' ? 'check-circle' : s.status === 'failed' ? 'x-circle' : 'skip-forward';
            addLog(icon, `[${(s.site || '').toUpperCase()}] ${s.action}`, time);
          }

        } else if (ev.type === 'push:completed' && taskId) {
          setTasks((prev) => {
            const next = new Map(prev);
            const task = next.get(taskId);
            if (task) {
              next.set(taskId, { ...task, status: 'completed' });
            }
            return next;
          });
          addLog('check-circle-2', 'Policy push completed', time);

        } else if (ev.type === 'push:failed' && taskId) {
          setTasks((prev) => {
            const next = new Map(prev);
            const task = next.get(taskId);
            if (task) {
              next.set(taskId, { ...task, status: 'failed', error: ev.data?.error });
            }
            return next;
          });
          addLog('x-circle', `Policy push failed: ${ev.data?.error || ''}`, time);

        } else if (ev.type === 'log') {
          const d = ev.data;
          const icon = d?.level === 'error' ? 'x-circle' : d?.level === 'warn' ? 'alert-triangle' : 'info';
          addLog(icon, d?.message || '', time);
        }
      };

      sse.onerror = () => {
        // SSE auto-reconnects
      };
    } catch (err) {
      console.error('SSE Error:', err);
    }

    return () => {
      if (sse) sse.close();
    };
  }, [addLog]);

  // Clean up completed/failed tasks after 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setTasks((prev) => {
        const next = new Map(prev);
        for (const [id, task] of next) {
          if (task.status !== 'running') {
            next.delete(id);
          }
        }
        return next.size !== prev.size ? next : prev;
      });
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  return { logs, setLogs, tasks, activeTasks, isRunning, addLog };
}
