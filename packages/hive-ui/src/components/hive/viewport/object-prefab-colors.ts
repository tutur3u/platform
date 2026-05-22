import { getStyleColor } from '../../../engine/style';
import type { HiveObject } from '../../../engine/types';

export function getObjectPrefabColors(object: HiveObject) {
  const primaryColor = getStyleColor(
    object.state,
    'color',
    getDefaultObjectColor(object.type)
  );

  return {
    accentColor: getStyleColor(
      object.state,
      'accentColor',
      getDefaultObjectAccentColor(object.type)
    ),
    primaryColor,
  };
}

function getDefaultObjectColor(type: string) {
  if (type === 'tree') return '#4a7c29';
  if (type === 'rock') return '#888c8d';
  if (type === 'bridge') return '#8a6338';
  if (type === 'lamp') return '#fff4d4';
  if (type === 'marker') return '#d2a84c';
  if (type === 'well') return '#787a7a';
  if (type === 'npc-spawn') return '#c89b45';
  if (type === 'sensor') return '#5f7c8a';
  if (type === 'flower-crop') return '#bc6fc5';
  if (type === 'fence') return '#aa7243';
  return '#6ea94d';
}

function getDefaultObjectAccentColor(type: string) {
  if (type === 'tree') return '#6eba3d';
  if (type === 'rock') return '#7a7d7e';
  if (type === 'bridge') return '#b8894f';
  if (type === 'sensor') return '#a8c8d1';
  return getDefaultObjectColor(type);
}
