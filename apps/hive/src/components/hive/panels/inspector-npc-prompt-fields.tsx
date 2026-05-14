'use client';

import { useTranslations } from 'next-intl';
import type { HiveNpc } from '@/engine/types';

type NpcPromptFieldsProps = {
  entity: HiveNpc;
  onPatch: (id: string, patch: Partial<HiveNpc>) => void;
};

export function NpcPromptFields({ entity, onPatch }: NpcPromptFieldsProps) {
  const t = useTranslations('studio.inspector');

  return (
    <section className="space-y-3 rounded-lg border border-border/20 bg-white/5 p-4">
      <h3 className="font-medium text-sm text-zinc-100">{t('npc_prompt')}</h3>
      <label className="block text-xs text-zinc-500">
        {t('role')}
        <input
          className="mt-1 w-full rounded-md border border-border/20 bg-black/20 px-3 py-2 text-zinc-100 outline-none transition focus:border-dynamic-green/60"
          onChange={(event) => onPatch(entity.id, { role: event.target.value })}
          value={entity.role}
        />
      </label>
      <label className="block text-xs text-zinc-500">
        {t('backstory')}
        <textarea
          className="mt-1 min-h-24 w-full rounded-md border border-border/20 bg-black/20 px-3 py-2 text-zinc-100 outline-none transition focus:border-dynamic-green/60"
          onChange={(event) =>
            onPatch(entity.id, { backstory: event.target.value })
          }
          value={entity.backstory}
        />
      </label>
    </section>
  );
}
