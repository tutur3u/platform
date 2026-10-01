'use client';

import { useTranslations } from 'next-intl';
import type { ComponentProps } from 'react';
import { useWorkspaceVisibility } from '../../../hooks/use-workspace-visibility';
import { Button } from '../button';
import { Filter } from './user-filters';

/** Filter choices only; never change the underlying authorized report/data query. */
export function VisibleWorkspaceFilter(props: ComponentProps<typeof Filter>) {
  const t = useTranslations('common');
  const visibility = useWorkspaceVisibility();
  return (
    <>
      <Filter
        {...props}
        options={
          visibility.known
            ? props.options?.filter(
                (option) => !visibility.hiddenIds.includes(option.value)
              )
            : []
        }
      />
      {!visibility.known && visibility.isError && (
        <span role="alert">
          {t('hidden_workspaces_load_error')}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              void visibility.refetch();
            }}
          >
            {t('retry')}
          </Button>
        </span>
      )}
    </>
  );
}
