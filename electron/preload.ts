import { ipcRenderer, contextBridge, webUtils } from 'electron'

// Try to require tty, but handle if it fails in sandbox
let tty: any;
try {
  tty = require('tty');
} catch (err) {
  console.warn('Could not load tty module in preload:', err);
  // Provide a fallback
  tty = {
    isatty: () => false
  };
}

// --------- Expose some API to the Renderer process ---------
contextBridge.exposeInMainWorld('ipcRenderer', {
  on(...args: Parameters<typeof ipcRenderer.on>) {
    const [channel, listener] = args
    return ipcRenderer.on(channel, (event, ...args) => listener(event, ...args))
  },
  off(...args: Parameters<typeof ipcRenderer.off>) {
    const [channel, ...omit] = args
    return ipcRenderer.off(channel, ...omit)
  },
  send(...args: Parameters<typeof ipcRenderer.send>) {
    const [channel, ...omit] = args
    return ipcRenderer.send(channel, ...omit)
  },
  invoke(...args: Parameters<typeof ipcRenderer.invoke>) {
    const [channel, ...omit] = args
    return ipcRenderer.invoke(channel, ...omit)
  },
  removeAllListeners(...args: Parameters<typeof ipcRenderer.removeAllListeners>) {
    const [channel, ...omit] = args
    return ipcRenderer.removeAllListeners(channel, ...omit)
  },
})

// Dialog APIs and tty
contextBridge.exposeInMainWorld('electronAPI', {
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
  pickFiles: () => ipcRenderer.invoke('pick-files'),
  getPathForFile: (file: File) => webUtils.getPathForFile(file),

  // Expose tty module functions
  tty: {
    isatty: (fd: number) => typeof tty.isatty === 'function' ? tty.isatty(fd) : false,
  },

  // Expose process information that libraries might need
  process: {
    platform: process.platform,
    version: process.version,
    versions: process.versions,
    env: process.env || {}
  }
})
