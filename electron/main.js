const { app, BrowserWindow, Menu, utilityProcess } = require("electron");
const { spawn, execSync } = require("child_process");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");

let mainWindow;
let serverProcess;
let serverPort;

// Generate a session token so only our Electron window can talk to the server
const SESSION_TOKEN = crypto.randomBytes(32).toString("hex");

const isDev = !app.isPackaged;

function getServerDir() {
  if (isDev) {
    return path.join(__dirname, "../server");
  }
  return path.join(process.resourcesPath, "server");
}

function loadEnvFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const vars = {};
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIndex = trimmed.indexOf("=");
      if (eqIndex === -1) continue;
      const key = trimmed.slice(0, eqIndex).trim();
      let val = trimmed.slice(eqIndex + 1).trim();
      // Remove surrounding quotes
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      vars[key] = val;
    }
    return vars;
  } catch {
    return {};
  }
}

function startServer() {
  return new Promise((resolve, reject) => {
    const serverDir = getServerDir();
    const envFile = loadEnvFile(path.join(serverDir, ".env"));
    const env = {
      ...process.env,
      ...envFile,
      PORT: "0",
      SESSION_TOKEN,
      ELECTRON: "true",
      PROJECT_ROOT: isDev ? path.join(__dirname, "..") : process.resourcesPath,
    };

    if (isDev) {
      // Dev mode: use ts-node via child_process (Node.js must be installed)
      console.log(`[server] Starting dev server with ts-node`);
      serverProcess = spawn("npx", ["ts-node", "app.ts"], {
        cwd: serverDir,
        env,
        stdio: ["pipe", "pipe", "pipe"],
        shell: true,
      });
    } else {
      // Production: use Electron's built-in Node.js via utilityProcess
      const entryPoint = path.join(serverDir, "dist", "app.js");
      console.log(`[server] Starting production server: ${entryPoint}`);

      serverProcess = utilityProcess.fork(entryPoint, [], {
        stdio: "pipe",
        env,
        serviceName: "ag-policy-server",
      });
    }

    let started = false;

    serverProcess.stdout.on("data", (data) => {
      const output = data.toString();
      console.log(`[server] ${output}`);

      const match = output.match(/localhost:(\d+)/i);
      if (match && !started) {
        started = true;
        serverPort = match[1];
        resolve(serverPort);
      }
    });

    serverProcess.stderr.on("data", (data) => {
      console.error(`[server:err] ${data}`);
    });

    serverProcess.on("exit", (code) => {
      console.log(`[server] Process exited with code ${code}`);
      if (!started) {
        reject(new Error(`Server exited before starting (code ${code})`));
      }
    });

    setTimeout(() => {
      if (!started) reject(new Error("Server start timeout (15s)"));
    }, 15000);
  });
}

async function waitForServer(port, retries = 30) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(`http://localhost:${port}/health`);
      if (res.ok) return true;
    } catch {
      // Server not ready yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("Server never became ready");
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    title: "A&G Policy Agent",
    icon: path.join(__dirname, "icon.png"),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  Menu.setApplicationMenu(null);
  mainWindow.loadFile(path.join(__dirname, "splash.html"));
  return mainWindow;
}

function killServer() {
  if (!serverProcess) return;

  try {
    if (isDev && process.platform === "win32") {
      // Dev mode on Windows: kill the shell process tree
      execSync(`taskkill /pid ${serverProcess.pid} /T /F`, { stdio: "ignore" });
    } else {
      // Production (utilityProcess) or non-Windows dev: .kill() works cleanly
      serverProcess.kill();
    }
  } catch {
    // Process may already be dead
  }
  serverProcess = null;
}

app.whenReady().then(async () => {
  const win = createWindow();

  try {
    const port = await startServer();
    await waitForServer(port);
    win.loadURL(`http://localhost:${port}`);
  } catch (err) {
    console.error("Failed to start:", err);

    win.webContents.executeJavaScript(`
      document.getElementById('status').textContent = 'Failed to start server';
      document.getElementById('details').textContent = '${String(err.message).replace(/'/g, "\\'")}';
      document.getElementById('details').style.color = '#ef4444';
    `);
  }
});

app.on("window-all-closed", () => {
  killServer();
  app.quit();
});

app.on("before-quit", () => {
  killServer();
});
