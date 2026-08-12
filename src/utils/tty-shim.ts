// Shim for tty module in renderer process
// Redirects to exposed electronAPI

export function isatty(fd: number): boolean {
  if (typeof window !== 'undefined' && (window as any).electronAPI?.tty) {
    return (window as any).electronAPI.tty.isatty(fd);
  }
  return false;
}

export class ReadStream {
  isTTY = false;
  isRaw = false;

  setRawMode(_mode: boolean) {
    return this;
  }
}

export class WriteStream {
  isTTY = false;
  columns = 80;
  rows = 24;

  clearLine() { }
  clearScreenDown() { }
  cursorTo() { }
  moveCursor() { }
  getColorDepth() {
    return 4;
  }
  getWindowSize(): [number, number] {
    return [80, 24];
  }
  hasColors() {
    return true;
  }
}

export default {
  isatty,
  ReadStream,
  WriteStream
};

