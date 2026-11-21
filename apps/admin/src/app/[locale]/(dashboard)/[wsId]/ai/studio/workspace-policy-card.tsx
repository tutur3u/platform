'use client';

import { Save } from '@tuturuuu/icons';
import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@tuturuuu/ui/accordion';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import type { AiStudioWorkspacePolicy } from './types';
import { WorkspacePolicyEditor } from './workspace-policy-editor';

export function WorkspacePolicyCard({
  isDirty,
  isPending,
  onChange,
  onSave,
  policy,
}: {
  isDirty: boolean;
  isPending: boolean;
  onChange: (patch: Partial<AiStudioWorkspacePolicy>) => void;
  onSave: () => void;
  policy: AiStudioWorkspacePolicy;
}) {
  const t = useTranslations('ai-studio-admin');
  const modelCount = policy.allowedModels.length + policy.deniedModels.length;
  const overrideCount = [
    policy.captureEnabled,
    policy.contentRetentionDays,
    policy.metadataRetentionDays,
    policy.monthlyCreditBudget,
    policy.requestsPerMinute,
  ].filter((value) => value !== null).length;

  return (
    <AccordionItem className="border-0" value={policy.wsId}>
      <AccordionTrigger className="px-4 py-3 hover:bg-muted/30 hover:no-underline">
        <div className="grid min-w-0 flex-1 items-center gap-2 pr-2 text-left md:grid-cols-[minmax(0,1.4fr)_minmax(8rem,0.55fr)_minmax(8rem,0.5fr)_minmax(9rem,0.65fr)] md:gap-3">
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate font-medium">
                {policy.workspaceName || t('workspaces.unnamed')}
              </span>
              {isDirty ? (
                <Badge className="shrink-0" variant="secondary">
                  {t('workspaces.unsaved')}
                </Badge>
              ) : null}
            </div>
            <p className="truncate font-mono text-[11px] text-muted-foreground">
              {policy.wsId}
            </p>
          </div>
          <div>
            <Badge
              variant={policy.apiKeyCreationApproved ? 'default' : 'outline'}
            >
              {policy.apiKeyCreationApproved
                ? t('workspaces.approved')
                : t('workspaces.approval_required')}
            </Badge>
          </div>
          <p className="text-muted-foreground text-xs">
            {t('workspaces.models_summary', { count: modelCount })}
          </p>
          <p className="text-muted-foreground text-xs">
            {t('workspaces.overrides_summary', { count: overrideCount })}
          </p>
        </div>
      </AccordionTrigger>
      <AccordionContent className="border-t bg-muted/10 p-4">
        <WorkspacePolicyEditor onChange={onChange} policy={policy} />
        <div className="mt-4 flex justify-end border-t pt-4">
          <Button disabled={isPending || !isDirty} onClick={onSave} size="sm">
            <Save className="mr-2 size-4" />
            {isPending ? t('workspaces.saving') : t('save')}
          </Button>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}
