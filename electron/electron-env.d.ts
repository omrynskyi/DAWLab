/// <reference types="vite-plugin-electron/electron-env" />

declare namespace NodeJS {
  interface ProcessEnv {
    /**
     * The built directory structure
     *
     * ```tree
     * ├─┬─┬ dist
     * │ │ └── index.html
     * │ │
     * │ ├─┬ dist-electron
     * │ │ ├── main.js
     * │ │ └── preload.js
     * │
     * ```
     */
    APP_ROOT: string
    /** /dist/ or /public/ */
    VITE_PUBLIC: string
  }
}

// Used in Renderer process, expose in `preload.ts`
interface Window {
  ipcRenderer: import('electron').IpcRenderer
  electronAPI: {
    pickFolder: () => Promise<string | null>;
    pickFiles: () => Promise<string[]>;
    getPathForFile: (file: File) => string;
    tty: {
      isatty: (fd: number) => boolean;
      ReadStream: typeof import('tty').ReadStream;
      WriteStream: typeof import('tty').WriteStream;
    };
  };
}

// defined for typesafety, matches the structure in electron/dawvcs.ts
interface ProjectInfo {
  id: string
  name: string
  path: string
}
