import { preload } from 'react-dom';
import { type FontSubsetName, fontSubsetFiles } from './subset-files';

export function FontPreloads({ names }: { names: readonly FontSubsetName[] }) {
  for (const name of names) {
    preload(fontSubsetFiles[name], {
      as: 'font',
      type: 'font/woff2',
      crossOrigin: 'anonymous',
    });
  }
  return null;
}
