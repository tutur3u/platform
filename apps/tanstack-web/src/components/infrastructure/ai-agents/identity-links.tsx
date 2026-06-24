'use client';

import { Loader2, Save, UserRoundPlus } from '@tuturuuu/icons';
import type { AiAgentIdentityLink } from '@tuturuuu/internal-api/infrastructure/ai';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { useTranslations } from 'use-intl';

export function IdentityLinks({
  identities,
  isPending,
  onSubmit,
}: {
  identities: AiAgentIdentityLink[];
  isPending: boolean;
  onSubmit: (payload: AiAgentIdentityLink, reset: () => void) => void;
}) {
  const t = useTranslations('ai-agents-settings');

  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <UserRoundPlus className="h-4 w-4 text-primary" />
        <h2 className="font-semibold text-lg">{t('identity.title')}</h2>
      </div>
      <form
        className="grid gap-3 md:grid-cols-5"
        onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const data = new FormData(form);
          onSubmit(
            {
              externalUserId: String(data.get('externalUserId') ?? '').trim(),
              platformUserId: String(data.get('platformUserId') ?? '').trim(),
              provider: 'zalo',
              providerAccountId: String(
                data.get('providerAccountId') ?? ''
              ).trim(),
              workspaceId: String(data.get('workspaceId') ?? '').trim(),
            },
            () => form.reset()
          );
        }}
      >
        <Input
          name="workspaceId"
          placeholder={t('fields.workspace_id')}
          required
        />
        <Input
          name="providerAccountId"
          placeholder={t('fields.zalo_oa_id')}
          required
        />
        <Input
          name="externalUserId"
          placeholder={t('fields.zalo_user_id')}
          required
        />
        <Input
          name="platformUserId"
          placeholder={t('fields.platform_user_id')}
          required
        />
        <Button disabled={isPending} type="submit">
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {t('actions.link_identity')}
        </Button>
      </form>
      {identities.length === 0 ? (
        <div className="rounded-lg border border-border border-dashed p-4 text-center text-muted-foreground text-sm">
          {t('identity.empty')}
        </div>
      ) : (
        <div className="grid gap-2 text-sm">
          {identities.map((identity) => (
            <div
              className="grid gap-2 rounded border border-border p-3 md:grid-cols-4"
              key={`${identity.workspaceId}:${identity.providerAccountId}:${identity.externalUserId}`}
            >
              <span>{identity.workspaceId}</span>
              <span>{identity.providerAccountId}</span>
              <span>{identity.externalUserId}</span>
              <span>{identity.platformUserId}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
