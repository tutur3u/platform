'use client';

import type { StorageObject } from '@tuturuuu/types/primitives/StorageObject';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getSelectionKey } from './drive-selection';

interface DriveSelectionStateOptions {
  currentPath: string;
  items: StorageObject[];
}

export function useDriveSelectionState({
  currentPath,
  items,
}: DriveSelectionStateOptions) {
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);

  const selectedItems = useMemo(() => {
    const itemMap = new Map(
      items.map((item) => [getSelectionKey(currentPath, item), item])
    );

    return selectedKeys
      .map((key) => itemMap.get(key))
      .filter((item): item is StorageObject => Boolean(item));
  }, [currentPath, items, selectedKeys]);

  const allVisibleSelected =
    items.length > 0 &&
    items.every((item) =>
      selectedKeys.includes(getSelectionKey(currentPath, item))
    );

  const toggleSelectedItem = useCallback(
    (item: StorageObject, checked: boolean) => {
      const selectionKey = getSelectionKey(currentPath, item);

      setSelectedKeys((current) =>
        checked
          ? Array.from(new Set([...current, selectionKey]))
          : current.filter((key) => key !== selectionKey)
      );
    },
    [currentPath]
  );

  const handleSelectAllVisible = useCallback(
    (checked: boolean) => {
      const visibleKeys = items.map((item) =>
        getSelectionKey(currentPath, item)
      );

      setSelectedKeys((current) =>
        checked
          ? Array.from(new Set([...current, ...visibleKeys]))
          : current.filter((key) => !visibleKeys.includes(key))
      );
    },
    [currentPath, items]
  );

  useEffect(() => {
    const visibleKeys = new Set(
      items.map((item) => getSelectionKey(currentPath, item))
    );

    setSelectedKeys((current) => {
      const next = current.filter((key) => visibleKeys.has(key));
      return next.length === current.length &&
        next.every((key, index) => key === current[index])
        ? current
        : next;
    });
  }, [currentPath, items]);

  return {
    allVisibleSelected,
    handleSelectAllVisible,
    selectedItems,
    selectedKeys,
    setSelectedKeys,
    toggleSelectedItem,
  };
}
