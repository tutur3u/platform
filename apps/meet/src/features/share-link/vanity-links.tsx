'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Pencil, Trash2, X } from '@tuturuuu/icons';
import {
  createWorkspaceMeetingShortLink,
  deleteWorkspaceMeetingShortLink,
  type MeetShortLink,
  type MeetShortLinksState,
  updateWorkspaceMeetingShortLink,
} from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { toast } from '@tuturuuu/ui/sonner';
import { Switch } from '@tuturuuu/ui/switch';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  displayLink,
  meetingShortLinksKey,
  shortLinkErrorKey,
} from './use-meeting-short-links';

type Draft = { slug: string; prefixed: boolean };
type Editing =
  | { kind: 'idle' }
  | { kind: 'editing'; linkId: string; draft: Draft };

function codeOf(link: MeetShortLink) {
  return link.prefixed ? link.slug.slice('meet/'.length) : link.slug;
}

/** Staff-only custom ttr.gg slugs for one meeting. */
export function VanityLinks({
  wsId,
  meetingId,
  state,
}: {
  wsId: string;
  meetingId: string;
  state: MeetShortLinksState;
}) {
  const t = useTranslations('meet.share');
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft>({ slug: '', prefixed: false });
  const [editing, setEditing] = useState<Editing>({ kind: 'idle' });
  const vanity = state.links.filter((link) => link.kind === 'vanity');

  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: meetingShortLinksKey(wsId, meetingId),
    });
  const onError = (error: unknown) =>
    toast.error(t(`errors.${shortLinkErrorKey(error)}`));

  const create = useMutation({
    mutationFn: (value: Draft) =>
      createWorkspaceMeetingShortLink(wsId, meetingId, {
        kind: 'vanity',
        slug: value.slug,
        prefixed: value.prefixed,
      }),
    onSuccess: () => {
      setDraft({ slug: '', prefixed: false });
      return refresh();
    },
    onError,
  });
  const update = useMutation({
    mutationFn: ({ linkId, value }: { linkId: string; value: Draft }) =>
      updateWorkspaceMeetingShortLink(wsId, meetingId, linkId, value),
    onSuccess: () => {
      setEditing({ kind: 'idle' });
      return refresh();
    },
    onError,
  });
  const remove = useMutation({
    mutationFn: (linkId: string) =>
      deleteWorkspaceMeetingShortLink(wsId, meetingId, linkId),
    onSuccess: refresh,
    onError,
  });

  return (
    <section className="space-y-3 border-border border-t pt-4">
      <h3 className="font-medium text-sm">{t('vanity_title')}</h3>
      {vanity.length ? (
        <ul className="space-y-2">
          {vanity.map((link) =>
            editing.kind === 'editing' && editing.linkId === link.id ? (
              <li key={link.id} className="flex items-center gap-2">
                <Input
                  aria-label={t('vanity_title')}
                  value={editing.draft.slug}
                  maxLength={40}
                  className="flex-1 font-mono"
                  onChange={(event) =>
                    setEditing({
                      ...editing,
                      draft: {
                        ...editing.draft,
                        slug: event.target.value.toLowerCase(),
                      },
                    })
                  }
                />
                <Button
                  size="icon"
                  aria-label={t('save')}
                  disabled={update.isPending}
                  onClick={() =>
                    update.mutate({ linkId: link.id, value: editing.draft })
                  }
                >
                  <Check className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={t('cancel')}
                  onClick={() => setEditing({ kind: 'idle' })}
                >
                  <X className="h-4 w-4" />
                </Button>
              </li>
            ) : (
              <li key={link.id} className="flex items-center gap-2">
                <span className="flex-1 truncate font-mono text-sm">
                  {displayLink(link.url)}
                </span>
                <span className="text-muted-foreground text-xs">
                  {t('clicks', { count: link.clicks })}
                </span>
                {link.canEdit ? (
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={t('edit')}
                    onClick={() =>
                      setEditing({
                        kind: 'editing',
                        linkId: link.id,
                        draft: { slug: codeOf(link), prefixed: link.prefixed },
                      })
                    }
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                ) : null}
                {link.canDelete ? (
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={t('delete')}
                    disabled={remove.isPending}
                    onClick={() => remove.mutate(link.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                ) : null}
              </li>
            )
          )}
        </ul>
      ) : null}
      <form
        className="flex items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (draft.slug) create.mutate(draft);
        }}
      >
        <span className="text-muted-foreground text-sm">
          {draft.prefixed ? 'ttr.gg/meet/' : 'ttr.gg/'}
        </span>
        <Input
          aria-label={t('vanity_title')}
          placeholder={t('vanity_placeholder')}
          value={draft.slug}
          maxLength={40}
          className="flex-1 font-mono"
          onChange={(event) =>
            setDraft({ ...draft, slug: event.target.value.toLowerCase() })
          }
        />
        <Button type="submit" disabled={!draft.slug || create.isPending}>
          {t('add')}
        </Button>
      </form>
      <div className="flex items-center justify-between gap-4">
        <Label htmlFor="meeting-vanity-prefix">{t('meet_prefix')}</Label>
        <Switch
          id="meeting-vanity-prefix"
          checked={draft.prefixed}
          onCheckedChange={(prefixed) => setDraft({ ...draft, prefixed })}
        />
      </div>
    </section>
  );
}
