import { useCallback, useEffect, useState } from 'react';

/**
 * The local username namespaces where projects live on disk (see
 * electron/dawvcs/core/constants.ts). It's initialized from the OS account
 * name on first run and persisted across restarts; users can rename it via
 * Settings, which also updates it here.
 */
export function useUsername() {
  const [username, setUsernameState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    window.ipcRenderer.invoke('get-username').then((value: string | null) => {
      if (!cancelled) {
        setUsernameState(value);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const updateUsername = useCallback(async (next: string) => {
    await window.ipcRenderer.invoke('set-username', next);
    setUsernameState(next);
  }, []);

  return { username, loading, setUsername: updateUsername };
}
