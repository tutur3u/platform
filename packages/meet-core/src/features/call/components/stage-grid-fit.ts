import { type RefObject, useEffect, useState } from 'react';

export type TileFit = {
  columns: number;
  rows: number;
  /** Integer CSS pixels so wrapped tiles never overflow by a sub-pixel. */
  tileWidth: number;
  tileHeight: number;
  /** True when tiles hit the minimum width and the stage must scroll. */
  scroll: boolean;
};

/**
 * Pick the column count that gives the largest fixed-aspect tiles inside a
 * stage, the way Google Meet fills its grid. When even the best fit would make
 * tiles narrower than `minWidth`, tiles keep that width and the stage scrolls.
 */
export function fitTileGrid({
  count,
  width,
  height,
  gap,
  aspect = 16 / 9,
  minWidth = 0,
}: {
  count: number;
  width: number;
  height: number;
  gap: number;
  aspect?: number;
  minWidth?: number;
}): TileFit | null {
  const stageWidth = Math.floor(width);
  const stageHeight = Math.floor(height);
  if (count < 1 || stageWidth <= 0 || stageHeight <= 0) return null;
  let best = { columns: 1, rows: count, tile: -1 };
  for (let columns = 1; columns <= count; columns++) {
    const rows = Math.ceil(count / columns);
    const tile = Math.min(
      (stageWidth - gap * (columns - 1)) / columns,
      ((stageHeight - gap * (rows - 1)) / rows) * aspect
    );
    if (tile > best.tile) best = { columns, rows, tile };
  }
  if (best.tile >= minWidth) {
    const tileWidth = Math.max(1, Math.floor(best.tile));
    return {
      columns: best.columns,
      rows: best.rows,
      tileWidth,
      tileHeight: Math.max(1, Math.floor(tileWidth / aspect)),
      scroll: false,
    };
  }
  const columns = Math.min(
    count,
    Math.max(1, Math.floor((stageWidth + gap) / (minWidth + gap)))
  );
  const room = Math.floor((stageWidth - gap * (columns - 1)) / columns);
  const tileWidth = Math.max(minWidth, Math.max(1, room));
  return {
    columns,
    rows: Math.ceil(count / columns),
    tileWidth,
    tileHeight: Math.max(1, Math.floor(tileWidth / aspect)),
    scroll: true,
  };
}

/** Content-box size of an element, or null until it has been measured. */
export function useElementSize(ref: RefObject<HTMLElement | null>) {
  const [size, setSize] = useState<{ width: number; height: number } | null>(
    null
  );
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const width = Math.floor(entry.contentRect.width);
      const height = Math.floor(entry.contentRect.height);
      setSize((current) =>
        current?.width === width && current.height === height
          ? current
          : { width, height }
      );
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}
