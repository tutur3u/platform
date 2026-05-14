'use client';

import { useTranslations } from 'next-intl';
import { getObjectCatalogItem, getTerrainColor } from '@/engine/catalog';
import { getStyleColor, normalizeStyleColor } from '@/engine/style';
import type { HiveBlock, HiveNpc, HiveObject } from '@/engine/types';
import { InspectorColorField } from './inspector-field-controls';

type InspectorStyleFieldsProps =
  | {
      entity: HiveBlock;
      kind: 'block';
      onPatch: (id: string, patch: Partial<Pick<HiveBlock, 'state'>>) => void;
    }
  | {
      entity: HiveObject;
      kind: 'object';
      onPatch: (id: string, patch: Partial<Pick<HiveObject, 'state'>>) => void;
    }
  | {
      entity: HiveNpc;
      kind: 'npc';
      onPatch: (id: string, patch: Partial<HiveNpc>) => void;
    };

export function InspectorStyleFields(props: InspectorStyleFieldsProps) {
  const t = useTranslations('studio.inspector');
  const fallbackPrimary = getPrimaryFallback(props);
  const fallbackAccent = getAccentFallback(props);
  const state =
    props.kind === 'npc' ? props.entity.settings : props.entity.state;
  const primary = getStyleColor(state, 'color', fallbackPrimary);
  const accent = getStyleColor(state, 'accentColor', fallbackAccent);

  const commitColor = (key: 'accentColor' | 'color', value: string) => {
    const fallback = key === 'color' ? fallbackPrimary : fallbackAccent;
    const next = normalizeStyleColor(value, fallback);

    if (props.kind === 'npc') {
      props.onPatch(props.entity.id, {
        settings: { ...props.entity.settings, [key]: next },
      });
      return;
    }

    props.onPatch(props.entity.id, {
      state: { ...(props.entity.state ?? {}), [key]: next },
    });
  };

  return (
    <section className="rounded-lg border border-border/20 bg-white/5 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="font-medium text-sm text-zinc-100">{t('style')}</h3>
        <span className="text-[11px] text-zinc-500">{t('persisted')}</span>
      </div>
      <div className="space-y-2">
        <InspectorColorField
          label={t('primary_color')}
          onCommit={(value) => commitColor('color', value)}
          value={primary}
        />
        <InspectorColorField
          label={t('accent_color')}
          onCommit={(value) => commitColor('accentColor', value)}
          value={accent}
        />
      </div>
    </section>
  );
}

function getPrimaryFallback(props: InspectorStyleFieldsProps) {
  if (props.kind === 'block') return getTerrainColor(props.entity.type);
  if (props.kind === 'npc') return '#c89b45';
  return getObjectCatalogItem(props.entity.type)?.color ?? '#d8a56a';
}

function getAccentFallback(props: InspectorStyleFieldsProps) {
  if (props.kind === 'block') return getTerrainColor(props.entity.type);
  if (props.kind === 'npc') return '#ebcdab';
  if (props.entity.type === 'house') return '#c05a5a';
  if (props.entity.type === 'cottage') return '#4d8ed8';
  return getObjectCatalogItem(props.entity.type)?.color ?? '#d8a56a';
}
