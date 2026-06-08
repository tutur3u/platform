'use client';

import type { ComponentType } from 'react';
import { useEffect, useState } from 'react';

export function useLazyClientComponent<TProps>(
  loadComponent: () => Promise<ComponentType<TProps>>,
  enabled = true
) {
  const [Component, setComponent] = useState<ComponentType<TProps> | null>(
    null
  );

  useEffect(() => {
    if (!enabled) {
      setComponent(null);
      return;
    }

    let active = true;

    void loadComponent().then((LoadedComponent) => {
      if (active) {
        setComponent(() => LoadedComponent);
      }
    });

    return () => {
      active = false;
    };
  }, [enabled, loadComponent]);

  return Component;
}
