'use client';

import { Tabs, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { useTranslations } from 'next-intl';
import {
  BehaviorTab,
  BrainTab,
  IdentityTab,
  InteractionsTab,
  SaveBar,
} from './npc-lab-panel-tab-sections';
import type { NpcLabTabsProps } from './npc-lab-panel-types';

export {
  createNpcDraft,
  type NpcDraft,
  type NpcLabInitialTab,
} from './npc-lab-panel-types';

export function NpcLabTabs(props: NpcLabTabsProps) {
  const t = useTranslations('studio.npcLab');

  return (
    <>
      <Tabs defaultValue={props.initialTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="identity">{t('tab_identity')}</TabsTrigger>
          <TabsTrigger value="brain">{t('tab_brain')}</TabsTrigger>
          <TabsTrigger value="behavior">{t('tab_behavior')}</TabsTrigger>
          <TabsTrigger value="interactions">
            {t('tab_interactions')}
          </TabsTrigger>
        </TabsList>
        <IdentityTab draft={props.draft} setDraft={props.setDraft} />
        <BrainTab
          aiContext={props.aiContext}
          draft={props.draft}
          setDraft={props.setDraft}
        />
        <BehaviorTab
          draft={props.draft}
          onPatchSettings={props.onPatchSettings}
        />
        <InteractionsTab {...props} />
      </Tabs>
      <SaveBar
        hasChanges={props.hasChanges}
        onResetDraft={props.onResetDraft}
        onSaveDraft={props.onSaveDraft}
      />
    </>
  );
}
