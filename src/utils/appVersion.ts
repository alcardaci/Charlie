import { useEffect, useState } from 'react';

export function useAppVersion(): string | null {
  const [appVersion, setAppVersion] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    window.charlie?.getVersion()
      .then((version) => {
        if (active && version.trim()) {
          setAppVersion(version.trim());
        }
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, []);

  return appVersion;
}
