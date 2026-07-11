import { useCallback, useMemo } from 'react';

type Config = {
  id?: string | null;
  value?: string | null;
};

type UseConfigMapResult = {
  configMap: Map<string, string>;
  getConfig: (id: string) => string | undefined;
};

export function useConfigMap(configs: Config[]): UseConfigMapResult {
  const configMap = useMemo(() => {
    const map = new Map<string, string>();
    configs.forEach((config) => {
      if (config.id && config.value) {
        map.set(config.id, config.value);
      }
    });
    return map;
  }, [configs]);

  const getConfig = useCallback((id: string) => configMap.get(id), [configMap]);

  return { configMap, getConfig };
}
