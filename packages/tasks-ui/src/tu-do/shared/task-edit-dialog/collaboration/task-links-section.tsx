'use client';

import { Loader2 } from '@tuturuuu/icons';
import { useTranslations } from 'next-intl';
import { AddLinkPopover } from './add-link-popover';
import { groupTaskLinks } from './link-groups';
import { LinkRow } from './link-row';
import { useTaskLinkMutations, useTaskLinks } from './use-task-links';

interface TaskLinksSectionProps {
  wsId: string;
  taskId: string;
  disabled?: boolean;
}

export function TaskLinksSection({
  wsId,
  taskId,
  disabled = false,
}: TaskLinksSectionProps) {
  const t = useTranslations('task-collaboration');
  const { data: links, isLoading, error } = useTaskLinks(wsId, taskId);
  const { add, remove } = useTaskLinkMutations(wsId, taskId, t('link_failed'));
  const groups = groupTaskLinks(links ?? []);

  return (
    <div className="space-y-3">
      {!disabled && (
        <div className="flex justify-end">
          <AddLinkPopover
            onAdd={(url) => add.mutateAsync(url)}
            pending={add.isPending}
          />
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <p className="py-4 text-center text-muted-foreground text-sm">
          {t('links_load_failed')}
        </p>
      ) : groups.length === 0 ? (
        <p className="py-4 text-center text-muted-foreground text-sm">
          {t('no_links')}
        </p>
      ) : (
        groups.map((group) => (
          <section key={group.kind} aria-label={t(`link_kind.${group.kind}`)}>
            <h4 className="mb-1 px-2 font-medium text-muted-foreground text-xs">
              {t(`link_kind.${group.kind}`)}
            </h4>
            <ul>
              {group.links.map((link) => (
                <LinkRow
                  canRemove={!disabled}
                  key={link.id ?? link.url}
                  link={link}
                  onRemove={(id) => remove.mutate(id)}
                  removing={
                    remove.isPending &&
                    !!link.id &&
                    remove.variables === link.id
                  }
                />
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
