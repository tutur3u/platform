import type { Active, Over } from '@dnd-kit/core';

interface DraggableData {
  type: 'Task' | 'Column';
  task?: unknown;
  column?: unknown;
}

export function hasDraggableData(
  element: Active | Over | null
): element is Active | Over {
  if (!element) return false;
  if (!element.data?.current) return false;

  const data = element.data.current as DraggableData;

  if (data.type === 'Task' && !data.task) return false;
  if (data.type === 'Column' && !data.column) return false;

  return data.type === 'Task' || data.type === 'Column';
}
