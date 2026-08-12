export {};

declare global {
  interface Window {
    ipcRenderer: {
      on(channel: string, listener: (event: any, ...args: any[]) => void): any;
      off(channel: string, listener: (event: any, ...args: any[]) => void): any;
      send(channel: string, ...args: any[]): void;
      invoke(channel: string, ...args: any[]): Promise<any>;
      removeAllListeners(channel: string): any;
    };
    electronAPI: {
      pickFolder: () => Promise<string | null>;
      pickFiles: () => Promise<string[]>;
      getPathForFile: (file: File) => string;
      tty: {
        isatty: (fd: number) => boolean;
        ReadStream: typeof import('tty').ReadStream;
        WriteStream: typeof import('tty').WriteStream;
      };
      process: {
        platform: string;
        version: string;
        versions: Record<string, string>;
        env: Record<string, string>;
      };
    };
  }
}
