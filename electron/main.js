const {
  app,
  BrowserWindow,
  Menu,
  utilityProcess,
  dialog,
  ipcMain,
} = require("electron");
const { spawn, execSync } = require("child_process");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");

let mainWindow;
let serverProcess;
let serverPort;
let serverPortFile;
let autoUpdater = null;
let updaterConfigured = false;

const SESSION_TOKEN = crypto.randomBytes(32).toString("hex");
const isDev = !app.isPackaged;

function loadAutoUpdater() {
  if (autoUpdater || isDev) return autoUpdater;

  try {
    ({ autoUpdater } = require("electron-updater"));
    return autoUpdater;
  } catch (err) {
    console.error("[updater] Failed to load electron-updater:", err.message);
    return null;
  }
}

function getServerDir() {
  if (isDev) {
    return path.join(__dirname, "../server");
  }
  return path.join(process.resourcesPath, "server");
}

function getStoragePath() {
  return isDev
    ? path.join(__dirname, "..", "storage")
    : path.join(app.getPath("userData"), "storage");
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
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      vars[key] = val;
    }
    return vars;
  } catch {
    return {};
  }
}

function cleanupPortFile() {
  if (!serverPortFile) return;
  try {
    if (fs.existsSync(serverPortFile)) fs.unlinkSync(serverPortFile);
  } catch {}
}

function startServer() {
  return new Promise((resolve, reject) => {
    const serverDir = getServerDir();
    serverPortFile = path.join(
      app.getPath("temp"),
      `ag-policy-agent-port-${process.pid}.txt`,
    );
    cleanupPortFile();

    const envFile = loadEnvFile(path.join(serverDir, ".env"));
    const env = {
      ...process.env,
      ...envFile,
      PORT: "0",
      SESSION_TOKEN,
      ELECTRON: "true",
      PROJECT_ROOT: isDev ? path.join(__dirname, "..") : process.resourcesPath,
      STORAGE_PATH: getStoragePath(),
      SERVER_PORT_FILE: serverPortFile,
    };

    if (isDev) {
      console.log(`[server] Starting dev server with ts-node`);
      serverProcess = spawn("npx", ["ts-node", "app.ts"], {
        cwd: serverDir,
        env,
        stdio: ["pipe", "pipe", "pipe"],
        shell: true,
      });
    } else {
      const entryPoint = path.join(serverDir, "dist", "app.js");
      console.log(`[server] Starting production server: ${entryPoint}`);
      serverProcess = utilityProcess.fork(entryPoint, [], {
        stdio: "pipe",
        env,
        serviceName: "ag-policy-server",
      });
    }

    let started = false;
    let settled = false;

    const startTimeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error("Server start timeout (30s)"));
      }
    }, 30000);

    function cleanup() {
      clearTimeout(startTimeout);
      clearInterval(portFilePoller);
    }

    function resolveOnce(value) {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    }

    function rejectOnce(error) {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    }

    const portFilePoller = setInterval(() => {
      if (settled || !serverPortFile || !fs.existsSync(serverPortFile)) return;

      try {
        const port = fs.readFileSync(serverPortFile, "utf-8").trim();
        if (port) {
          started = true;
          serverPort = port;
          resolveOnce(serverPort);
        }
      } catch {}
    }, 200);

    serverProcess.stdout.on("data", (data) => {
      const output = data.toString();
      console.log(`[server] ${output}`);

      const match = output.match(/localhost:(\d+)/i);
      if (match && !started) {
        started = true;
        serverPort = match[1];
        resolveOnce(serverPort);
      }
    });

    serverProcess.stderr.on("data", (data) => {
      console.error(`[server:err] ${data}`);
    });

    serverProcess.on("exit", (code) => {
      console.log(`[server] Process exited with code ${code}`);
      cleanupPortFile();
      if (!started) {
        rejectOnce(new Error(`Server exited before starting (code ${code})`));
      }
    });
  });
}

async function waitForServer(port, retries = 60) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(`http://localhost:${port}/health`);
      if (res.ok) return true;
    } catch {}
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
      execSync(`taskkill /pid ${serverProcess.pid} /T /F`, { stdio: "ignore" });
    } else {
      serverProcess.kill();
    }
  } catch {}

  cleanupPortFile();
  serverProcess = null;
}

function clearStoredSessions() {
  const storagePath = getStoragePath();
  for (const file of [
    "ag-session.json",
    "niid-session.json",
    "niid-push-session.json",
    "ag-auto-push-session.json",
    "niid-auto-push-session.json",
  ]) {
    const fullPath = path.join(storagePath, file);
    try {
      if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
    } catch (err) {
      console.error(`[startup] Failed to delete session file ${fullPath}:`, err);
    }
  }
}

function restartApp({ clearSessions = false } = {}) {
  if (clearSessions) {
    clearStoredSessions();
  }
  killServer();
  app.relaunch();
  app.exit(0);
}

ipcMain.on("window:minimize", () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on("window:maximize", () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
});

ipcMain.on("window:close", () => {
  if (mainWindow) mainWindow.close();
});

ipcMain.on("app:restart", () => {
  restartApp();
});

ipcMain.on("app:restart-clear-sessions", () => {
  restartApp({ clearSessions: true });
});

function configureAutoUpdater() {
  if (updaterConfigured) return autoUpdater;

  const updater = loadAutoUpdater();
  if (!updater) return null;
  updaterConfigured = true;

  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = true;

  updater.on("update-available", (info) => {
    console.log(`[updater] Update available: v${info.version}`);
    dialog.showMessageBox(mainWindow, {
      type: "info",
      title: "Update Available",
      message: `A new version (v${info.version}) is available. It will be downloaded in the background.`,
    });
  });

  updater.on("download-progress", (progress) => {
    const percent = Math.round(progress.percent);
    console.log(`[updater] Download progress: ${percent}%`);

    if (mainWindow) {
      mainWindow.setProgressBar(progress.percent / 100);
      mainWindow.setTitle(`A&G Policy Agent - Updating ${percent}%`);
    }
  });

  updater.on("update-downloaded", (info) => {
    console.log(`[updater] Update downloaded: v${info.version}`);

    if (mainWindow) {
      mainWindow.setProgressBar(-1);
      mainWindow.setTitle("A&G Policy Agent");
    }

    dialog
      .showMessageBox(mainWindow, {
        type: "info",
        title: "Update Ready",
        message: `Version ${info.version} has been downloaded. Restart now to install the update?`,
        buttons: ["Restart Now", "Later"],
        defaultId: 0,
      })
      .then((result) => {
        if (result.response === 0) {
          updater.quitAndInstall();
        }
      });
  });

  updater.on("error", (err) => {
    console.error("[updater] Error:", err.message);

    if (mainWindow) {
      mainWindow.setProgressBar(-1);
      mainWindow.setTitle("A&G Policy Agent");

      dialog.showMessageBox(mainWindow, {
        type: "error",
        title: "Update Failed",
        message:
          "Failed to download the update. Please check your internet connection and try again later.",
        detail: err.message,
      });
    }
  });

  return updater;
}

function checkForUpdatesManually() {
  if (!app.isPackaged) {
    dialog.showMessageBox(mainWindow, {
      type: "info",
      title: "Updates Unavailable",
      message:
        "Manual update checks are only available in installed production builds.",
    });
    return;
  }

  const updater = configureAutoUpdater();

  if (!updater) {
    dialog.showMessageBox(mainWindow, {
      type: "warning",
      title: "Updater Unavailable",
      message:
        "The updater module could not be loaded in this build. Reinstall using the official setup installer and release assets.",
    });
    return;
  }

  dialog.showMessageBox(mainWindow, {
    type: "info",
    title: "Checking for Updates",
    message: "The app is checking for updates in the background.",
  });

  updater.checkForUpdatesAndNotify();
}

ipcMain.on("app:check-for-updates", () => {
  checkForUpdatesManually();
});

app.whenReady().then(async () => {
  const win = createWindow();
  const updater = configureAutoUpdater();

  try {
    const port = await startServer();
    await waitForServer(port);
    cleanupPortFile();
    win.loadURL(`http://localhost:${port}`);

    if (updater) {
      updater.checkForUpdatesAndNotify();
    }
  } catch (err) {
    console.error("Failed to start:", err);

    win.webContents.executeJavaScript(`
      document.getElementById('status').textContent = 'Failed to start services';
      document.getElementById('details').textContent = '${String(err.message).replace(/'/g, "\\'")}';
      document.getElementById('details').style.color = '#ef4444';
      document.getElementById('actions').style.display = 'flex';
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
