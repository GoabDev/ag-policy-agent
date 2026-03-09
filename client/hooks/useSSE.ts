import { useEffect, useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { sileo } from 'sileo';

export interface TaskState {
  id: string;
  type: string;
  policyNumber?: string;
  steps: any[];
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  error?: string;
}

export function useSSE() {
  const queryClient = useQueryClient();
  const [logs, setLogs] = useState<any[]>([]);
  const [tasks, setTasks] = useState<Map<string, TaskState>>(new Map());

  const getSessionLabel = useCallback((site?: string) => {
    switch (site) {
      case 'ag':
        return 'A&G session';
      case 'ag_push':
        return 'A&G Push session';
      case 'niid':
        return 'NIID session';
      case 'niid_push':
        return 'NIID Push session';
      default:
        return 'Session';
    }
  }, []);

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
              sileo.success({ title: 'Correction completed', description: `${task.type} — ${task.policyNumber}` });
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
              sileo.error({ title: 'Correction failed', description: ev.data?.error || `${task.type} — ${task.policyNumber}` });
            }
            return next;
          });
          addLog('x-circle', `Task failed: ${ev.data?.error || ''}`, time);

        } else if (ev.type === 'task:cancelled' && taskId) {
          setTasks((prev) => {
            const next = new Map(prev);
            const task = next.get(taskId);
            if (task) {
              next.set(taskId, { ...task, status: 'cancelled' });
              sileo.warning({ title: 'Correction cancelled', description: task.policyNumber ? `${task.type} — ${task.policyNumber}` : task.type });
            }
            return next;
          });
          addLog('x-circle', 'Task cancelled by user', time);

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
              sileo.success({ title: 'Policy push completed', description: task.policyNumber });
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
              sileo.error({ title: 'Policy push failed', description: ev.data?.error || task.policyNumber });
            }
            return next;
          });
          addLog('x-circle', `Policy push failed: ${ev.data?.error || ''}`, time);

        } else if (ev.type === 'push:cancelled' && taskId) {
          setTasks((prev) => {
            const next = new Map(prev);
            const task = next.get(taskId);
            if (task) {
              next.set(taskId, { ...task, status: 'cancelled' });
              sileo.warning({ title: 'Policy push cancelled', description: task.policyNumber });
            }
            return next;
          });
          addLog('x-circle', 'Policy push cancelled by user', time);

        } else if (ev.type === 'session:login_required') {
          sileo.warning({
            title: `${getSessionLabel(ev.data?.site)} login required`,
            description: ev.data?.message || 'A session has expired. Please log in again.',
          });

        } else if (ev.type === 'session:login_failed') {
          sileo.error({
            title: `${getSessionLabel(ev.data?.site)} failed`,
            description: ev.data?.message || 'Session login failed. Please try again.',
          });

        } else if (ev.type === 'session:status') {
          queryClient.invalidateQueries({ queryKey: ['status'] });

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
  }, [addLog, getSessionLabel, queryClient]);

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
