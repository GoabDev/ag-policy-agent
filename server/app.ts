import express from 'express';
import cors from 'cors';
import path from 'path';
import { config } from './config';
import { addSSEClient, log, loadTaskLogs } from './utils/logger';
import { getSessionStatus, closeBrowser } from './browser/controller';
import { startAllHeartbeats, stopAllHeartbeats, startHeartbeat } from './browser/keepAlive';
import { runCorrection, getCurrentTask, getTaskHistory } from './agents/correctionRunner';
import { CorrectionInput } from './types';

const app = express();
app.use(cors());
app.use(express.json());

// Serve dashboard
app.use(express.static(config.dashboardPath));

const startTime = Date.now();

// ============================================
// API Routes
// ============================================

// Agent status
app.get('/api/status', (req, res) => {
  res.json({
    success: true,
    data: {
      isRunning: true,
      currentTask: getCurrentTask(),
      sessions: {
        ag: getSessionStatus('ag'),
        niid: getSessionStatus('niid'),
      },
      uptime: Math.floor((Date.now() - startTime) / 1000),
    },
  });
});

// Submit a correction task
app.post('/api/corrections/run', async (req, res) => {
  try {
    const input: CorrectionInput = req.body;

    // Basic validation
    if (!input.type || !input.policyNumber) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: type and policyNumber',
      });
    }

    // Validate based on type
    switch (input.type) {
      case 'name':
        if (!(input as any).newName) {
          return res.status(400).json({ success: false, error: 'Missing newName' });
        }
        break;
      case 'registration':
        if (!(input as any).newRegistrationNumber) {
          return res.status(400).json({ success: false, error: 'Missing newRegistrationNumber' });
        }
        break;
      case 'vehicle_make':
        if (!(input as any).newVehicleMake) {
          return res.status(400).json({ success: false, error: 'Missing newVehicleMake' });
        }
        break;
      default:
        return res.status(400).json({ success: false, error: `Unknown type: ${(input as any).type}` });
    }

    // Run correction (async — responds immediately, streams progress via SSE)
    const task = runCorrection(input);

    // Return task ID immediately
    res.json({
      success: true,
      data: { taskId: (await task).id, message: 'Correction task started' },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get correction history
app.get('/api/corrections/logs', (req, res) => {
  const history = getTaskHistory();
  const fileLogs = loadTaskLogs();

  // Merge in-memory and file-based logs (deduplicate by id)
  const seen = new Set(history.map(t => t.id));
  const merged = [
    ...history,
    ...fileLogs.filter(t => !seen.has(t.id)),
  ];

  res.json({ success: true, data: merged });
});

// Login to A&G (auto)
app.post('/api/sessions/login-ag', async (req, res) => {
  try {
    const { loginToAG } = await import('./browser/actions/ag');
    await loginToAG();
    startHeartbeat('ag');
    res.json({ success: true, data: { message: 'Logged into A&G successfully' } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Open browser for manual NIID login
app.post('/api/sessions/login-niid', async (req, res) => {
  res.json({
    success: true,
    data: {
      message: 'Please run "npm run login:niid" in your terminal to open a browser window for manual NIID login.',
      command: 'npm run login:niid',
    },
  });
});

// Trigger keepalive
app.post('/api/sessions/keepalive', async (req, res) => {
  try {
    startAllHeartbeats();
    res.json({ success: true, data: { message: 'Heartbeats started' } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================
// SSE Endpoint for live updates
// ============================================

app.get('/api/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  // Send initial connected event
  res.write(`data: ${JSON.stringify({ type: 'connected', timestamp: new Date().toISOString() })}\n\n`);

  addSSEClient(res);
});

// ============================================
// Start Server
// ============================================

app.listen(config.port, () => {
  console.log(`
  ╔══════════════════════════════════════════════╗
  ║   A&G Policy Correction Agent                ║
  ║                                              ║
  ║   Dashboard: http://localhost:${config.port}          ║
  ║   API:       http://localhost:${config.port}/api      ║
  ║                                              ║
  ║   Status: RUNNING                            ║
  ╚══════════════════════════════════════════════╝
  `);

  // Start heartbeats for any existing sessions
  startAllHeartbeats();
});

// Graceful shutdown
process.on('SIGINT', async () => {
  log('Shutting down...');
  stopAllHeartbeats();
  await closeBrowser();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  stopAllHeartbeats();
  await closeBrowser();
  process.exit(0);
});