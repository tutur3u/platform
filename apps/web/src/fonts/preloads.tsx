import { preload } from 'react-dom';

export function FontPreloads({ names }: { names: readonly string[] }) {
  for (const name of names) {
    preload(`/fonts/subsets/${name}-core.woff2`, {
      as: 'font',
      type: 'font/woff2',
      crossOrigin: 'anonymous',
    });
  }
  return null;
}
