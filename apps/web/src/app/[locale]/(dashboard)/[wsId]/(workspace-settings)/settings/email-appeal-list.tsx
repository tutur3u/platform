'use client';

import { useQuery } from '@tanstack/react-query';
import { listWorkspaceEmailAppeals } from '@tuturuuu/internal-api/email-appeals';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  SettingsSection,
  SettingsSectionBlock,
  SettingsSectionFooter,
  SettingsSectionMessage,
} from '@tuturuuu/ui/custom/settings-section';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import EmailAppealRow from './email-appeal-row';

export default function EmailAppealList({ wsId }: { wsId: string }) {
  const t = useTranslations('email-appeals');
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState('');
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ['email-appeals', wsId, search, page],
    queryFn: () => listWorkspaceEmailAppeals(wsId, { search, page }),
    retry: false,
  });

  function renderEntries() {
    switch (query.status) {
      case 'pending':
        return <SettingsSectionMessage>{t('loading')}</SettingsSectionMessage>;
      case 'error':
        return (
          <SettingsSectionMessage
            tone="error"
            action={
              <Button variant="outline" onClick={() => query.refetch()}>
                {t('retry')}
              </Button>
            }
          >
            {t('load_error')}
          </SettingsSectionMessage>
        );
      case 'success': {
        const { entries, total, pageSize } = query.data;
        return (
          <>
            {query.data.providerInventory !== 'checked' ? (
              <SettingsSectionMessage>
                {t('provider_unavailable')}
              </SettingsSectionMessage>
            ) : null}
            {query.isFetching ? (
              <SettingsSectionMessage>{t('refreshing')}</SettingsSectionMessage>
            ) : null}
            {entries.length === 0 ? (
              <SettingsSectionMessage>{t('empty')}</SettingsSectionMessage>
            ) : (
              entries.map((entry) => (
                <SettingsSectionBlock key={entry.email}>
                  <EmailAppealRow entry={entry} wsId={wsId} />
                </SettingsSectionBlock>
              ))
            )}
            <SettingsSectionFooter className="items-center justify-between">
              <span className="text-muted-foreground text-sm">
                {t('page', { page, total })}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  disabled={page <= 1 || query.isFetching}
                  onClick={() => setPage(page - 1)}
                >
                  {t('previous')}
                </Button>
                <Button
                  variant="outline"
                  disabled={page * pageSize >= total || query.isFetching}
                  onClick={() => setPage(page + 1)}
                >
                  {t('next')}
                </Button>
              </div>
            </SettingsSectionFooter>
          </>
        );
      }
      default: {
        const exhaustive: never = query;
        return exhaustive;
      }
    }
  }

  return (
    <SettingsSection
      title={t('title')}
      action={<Badge variant="outline">{t('experimental')}</Badge>}
    >
      <SettingsSectionBlock>
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            setSearch(draft.trim());
            setPage(1);
          }}
        >
          <div className="min-w-0 flex-1 space-y-2">
            <Label htmlFor="email-appeal-search">{t('search')}</Label>
            <Input
              id="email-appeal-search"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              maxLength={254}
            />
          </div>
          <Button type="submit">{t('search')}</Button>
        </form>
      </SettingsSectionBlock>
      {renderEntries()}
    </SettingsSection>
  );
}
