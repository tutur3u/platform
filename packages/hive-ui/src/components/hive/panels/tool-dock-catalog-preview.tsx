'use client';

import {
  getTerrainColor,
  getTerrainHeight,
  getTerrainSideColor,
} from '../../../engine/catalog';

const ASSET_SHEET = '/assets/hive/hive-voxel-asset-sheet.png';
const assetIndexById: Record<string, number> = {
  bridge: 13,
  'crop-soil': 2,
  crop: 16,
  fence: 12,
  garden: 3,
  grass: 0,
  greenhouse: 7,
  house: 6,
  lamp: 11,
  path: 1,
  resident: 21,
  sensor: 23,
  stone: 5,
  warehouse: 9,
  water: 4,
  well: 10,
  workshop: 8,
};

export function getAssetPreviewStyle(id: string) {
  const index = assetIndexById[id];
  if (index === undefined) return null;
  const column = index % 6;
  const row = Math.floor(index / 6);

  return {
    backgroundImage: `url(${ASSET_SHEET})`,
    backgroundPosition: `${(column / 5) * 100}% ${(row / 4) * 100}%`,
    backgroundSize: '600% 500%',
  };
}

export function CatalogPreviewSwatch({
  color,
  id,
  mode,
  previewStyle,
}: {
  color: string;
  id: string;
  mode: 'asset' | 'terrain';
  previewStyle: ReturnType<typeof getAssetPreviewStyle>;
}) {
  if (mode !== 'terrain') {
    return (
      <span
        className="h-7 w-8 rounded border border-black/10 bg-center bg-cover shadow-sm"
        style={previewStyle ?? { backgroundColor: color }}
      />
    );
  }

  const raised = getTerrainHeight(id) > 0.18;

  return (
    <span className="relative h-7 w-8 overflow-hidden rounded border border-black/10 bg-black/20 shadow-sm">
      <span
        className={[
          'absolute inset-x-1 top-1 rounded-[3px] border border-white/15',
          raised ? 'h-4' : 'h-3',
        ].join(' ')}
        style={{ backgroundColor: getTerrainColor(id) }}
      />
      <span
        className={[
          'absolute inset-x-1 bottom-1 rounded-b-[3px]',
          raised ? 'h-3' : 'h-3.5',
        ].join(' ')}
        style={{ backgroundColor: getTerrainSideColor(id) }}
      />
    </span>
  );
}
