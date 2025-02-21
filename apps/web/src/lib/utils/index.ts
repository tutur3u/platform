export function randomElement<T>(array: Array<T>): T | undefined {
  return array[Math.floor(Math.random() * array.length)];
}

export * from './cssVar';
export * from './getConnectionText';
export * from './getRenderContainer';
export * from './isCustomNodeSelected';
export * from './isTextSelected';
