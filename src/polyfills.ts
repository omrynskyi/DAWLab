// Runtime polyfills for Node.js globals that npm packages expect

// Polyfill process global
(window as any).process = {
  env: {
    TERM: 'xterm-256color',
    COLORTERM: 'truecolor',
    FORCE_COLOR: '1',
    NODE_ENV: import.meta.env.MODE || 'development',
    CI: '',
    TERM_PROGRAM: 'electron',
  },
  platform: navigator.platform.toLowerCase().includes('win') ? 'win32' 
    : navigator.platform.toLowerCase().includes('mac') ? 'darwin' 
    : 'linux',
  version: 'v18.0.0',
  versions: { node: '18.0.0', electron: '1.0.0' },
  stdout: {
    isTTY: false,
    columns: 80,
    rows: 24,
    hasColors: () => true,
    getColorDepth: () => 24,
    write: () => true,
  },
  stderr: {
    isTTY: false,
    columns: 80,
    rows: 24,
    write: () => true,
  },
  argv: [],
  execPath: '',
  cwd: () => '/',
  nextTick: (fn: (...args: unknown[]) => void) => setTimeout(fn, 0),
};

// Polyfill global
(window as any).global = window;

export {};
