'use client';

import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Switch } from '@tuturuuu/ui/switch';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { HiveNpc } from '@/engine/types';

type HiveAgentBatchEditorProps = {
  npcs: HiveNpc[];
  onPatchNpc: (id: string, patch: Partial<HiveNpc>) => void;
  selectedIds: string[];
};

export function HiveAgentBatchEditor({
  npcs,
  onPatchNpc,
  selectedIds,
}: HiveAgentBatchEditorProps) {
  const t = useTranslations('studio.agents');
  const [rolePatch, setRolePatch] = useState('');
  const [autonomousPatch, setAutonomousPatch] = useState(false);
  const [memoryPatch, setMemoryPatch] = useState(true);

  const applyBatchPatch = () => {
    for (const npcId of selectedIds) {
      const npc = npcs.find((item) => item.id === npcId);
      if (!npc) continue;
      onPatchNpc(npc.id, {
        memoryEnabled: memoryPatch,
        role: rolePatch.trim() || npc.role,
        settings: {
          ...npc.settings,
          autonomous: autonomousPatch,
        },
      });
    }
  };

  return (
    <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-2">
      <Input
        aria-label={t('batch_role')}
        onChange={(event) => setRolePatch(event.target.value)}
        placeholder={t('batch_role')}
        value={rolePatch}
      />
      <div className="grid grid-cols-2 gap-2">
        <label className="flex items-center justify-between gap-2 rounded-md border border-border bg-background p-2 text-xs">
          {t('autonomous')}
          <Switch
            checked={autonomousPatch}
            onCheckedChange={setAutonomousPatch}
          />
        </label>
        <label className="flex items-center justify-between gap-2 rounded-md border border-border bg-background p-2 text-xs">
          {t('memory')}
          <Switch checked={memoryPatch} onCheckedChange={setMemoryPatch} />
        </label>
      </div>
      <Button
        className="w-full"
        disabled={selectedIds.length === 0}
        onClick={applyBatchPatch}
        size="sm"
        type="button"
        variant="outline"
      >
        {t('apply_batch')}
      </Button>
    </div>
  );
}
