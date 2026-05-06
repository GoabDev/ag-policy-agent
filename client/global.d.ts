export {};

declare global {
  interface Window {
    electronAPI?: {
      isElectron: boolean;
      minimize: () => void;
      maximize: () => void;
      close: () => void;
      restart: () => void;
      restartAndClearSessions: () => void;
      checkForUpdates: () => void;
    };
  }
}
