import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  platform: process.platform
});

declare global {
  interface Window {
    electronAPI: {
      platform: NodeJS.Platform;
    };
  }
}
