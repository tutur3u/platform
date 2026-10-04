'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getLettinBlacklist,
  type LettinBlacklistItem,
  mutateLettinBlacklist,
} from '@tuturuuu/internal-api/lettin';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Input } from '@tuturuuu/ui/input';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useNavigationGuard } from './navigation-guard';

const empty = { displayName: '', reason: '', referenceUrl: '' };
export function BlacklistManager({ wsId }: { wsId: string }) {
  const t = useTranslations('lettin'),
    client = useQueryClient();
  const { dirty, setDirty } = useNavigationGuard();
  const [draft, setDraft] = useState(empty),
    [editing, setEditing] = useState<string>(),
    [removing, setRemoving] = useState<LettinBlacklistItem>();
  const query = useQuery({
    queryKey: ['lettin-blacklist', wsId],
    queryFn: () => getLettinBlacklist(wsId),
  });
  const mutation = useMutation({
    mutationFn: (command: Parameters<typeof mutateLettinBlacklist>[1]) =>
      mutateLettinBlacklist(wsId, command),
    onSuccess: async () => {
      setDraft(empty);
      setEditing(undefined);
      setRemoving(undefined);
      setDirty(false);
      await client.invalidateQueries({ queryKey: ['lettin-blacklist', wsId] });
    },
  });
  if (query.isPending)
    return (
      <p role="status" className="p-10">
        {t('loading')}
      </p>
    );
  if (!query.data)
    return (
      <div role="alert" className="p-10">
        {t('requestFailed')}{' '}
        <Button onClick={() => query.refetch()}>{t('retry')}</Button>
      </div>
    );
  const validUrl =
    !draft.referenceUrl ||
    (() => {
      try {
        return new URL(draft.referenceUrl).protocol === 'https:';
      } catch {
        return false;
      }
    })();
  return (
    <main className="creator-profile-editor space-y-8">
      <header>
        <p className="lettin-kicker">{t('moderation')}</p>
        <h1>{t('privateBlacklist')}</h1>
        <p>{t('blacklistPrivacy')}</p>
      </header>
      <form
        className="notebook-paper space-y-4 p-6"
        onSubmit={(e) => {
          e.preventDefault();
          if (draft.displayName.trim() && validUrl)
            mutation.mutate({ action: 'save', id: editing, draft });
        }}
      >
        {(['displayName', 'referenceUrl'] as const).map((key) => (
          <label key={key} className="block space-y-2 text-sm">
            {t(`blacklist${key}`)}
            <Input
              value={draft[key]}
              maxLength={key === 'displayName' ? 160 : 2000}
              disabled={mutation.isPending}
              type={key === 'referenceUrl' ? 'url' : 'text'}
              onChange={(e) => {
                setDraft((prev) => ({ ...prev, [key]: e.target.value }));
                setDirty(true);
              }}
            />
          </label>
        ))}
        <label className="block space-y-2 text-sm">
          {t('blacklistReason')}
          <Textarea
            value={draft.reason}
            maxLength={4000}
            disabled={mutation.isPending}
            onChange={(e) => {
              setDraft((prev) => ({ ...prev, reason: e.target.value }));
              setDirty(true);
            }}
          />
        </label>
        <div className="flex gap-2">
          <Button
            disabled={
              mutation.isPending ||
              !dirty ||
              !draft.displayName.trim() ||
              !validUrl
            }
          >
            {t(editing ? 'saveChanges' : 'addBlacklist')}
          </Button>
          {(dirty || editing) && (
            <Button
              type="button"
              variant="ghost"
              disabled={mutation.isPending}
              onClick={() => {
                setDraft(empty);
                setEditing(undefined);
                setDirty(false);
                mutation.reset();
              }}
            >
              {t('cancel')}
            </Button>
          )}
        </div>
      </form>
      {mutation.error && <p role="alert">{t('requestFailed')}</p>}
      {!query.data.length && (
        <p className="text-muted-foreground">{t('emptyBlacklist')}</p>
      )}
      <ul className="space-y-4">
        {query.data.map((item) => (
          <li key={item.id} className="notebook-paper space-y-3 p-6">
            <h2 className="text-xl">{item.displayName}</h2>
            <p className="whitespace-pre-wrap break-words">{item.reason}</p>
            {item.referenceUrl.startsWith('https://') && (
              <a
                className="text-sm underline"
                href={item.referenceUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t('blacklistReference')}
              </a>
            )}
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={dirty || mutation.isPending}
                onClick={() => {
                  setEditing(item.id);
                  setDraft(item);
                  mutation.reset();
                }}
              >
                {t('edit')}
              </Button>
              <Button
                variant="ghost"
                disabled={dirty || mutation.isPending}
                onClick={() => setRemoving(item)}
              >
                {t('remove')}
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <Dialog
        open={!!removing}
        onOpenChange={(open) => {
          if (!open && !mutation.isPending) setRemoving(undefined);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('removeBlacklist')}</DialogTitle>
            <DialogDescription>{removing?.displayName}</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              disabled={mutation.isPending}
              onClick={() => setRemoving(undefined)}
            >
              {t('cancel')}
            </Button>
            <Button
              disabled={mutation.isPending}
              onClick={() =>
                removing &&
                mutation.mutate({ action: 'remove', id: removing.id })
              }
            >
              {t('remove')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}
