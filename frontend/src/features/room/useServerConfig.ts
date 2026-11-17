import { useEffect, useState } from 'react';

type ServerConfig = {
  turnConfigured: boolean;
  directEnabled: boolean;
};

export function useServerConfig() {
  const [config, setConfig] = useState<ServerConfig | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/config', { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error();
        return response.json();
      })
      .then((value: ServerConfig) => {
        if (!controller.signal.aborted) setConfig(value);
      })
      .catch(() => {
        if (!controller.signal.aborted) setConfig(null);
      });
    return () => controller.abort();
  }, []);

  return config;
}
