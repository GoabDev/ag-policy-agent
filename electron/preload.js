const { contextBridge, ipcRenderer } = require("electron");

// Expose a safe API to the renderer (your frontend)
// Add methods here if you need Electron-specific features in the UI
contextBridge.exposeInMainWorld("electronAPI", {
  // App info
  isElectron: true,

  // Window controls (if you want custom title bar later)
  minimize: () => ipcRenderer.send("window:minimize"),
  maximize: () => ipcRenderer.send("window:maximize"),
  close: () => ipcRenderer.send("window:close"),
});
