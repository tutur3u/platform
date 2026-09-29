'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, Loader2, Plus, RefreshCw } from '@tuturuuu/icons';
import {
  createReviewAccount,
  listReviewAccounts,
  type ReviewAccount,
  updateReviewAccount,
} from '@tuturuuu/internal-api/infrastructure';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { useCopyToClipboard } from '@tuturuuu/ui/hooks/use-copy-to-clipboard';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { toast } from '@tuturuuu/ui/sonner';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

const QUERY_KEY = ['infrastructure', 'review-accounts'];
type Action = 'rotate_password' | 'disable' | 'enable';

export function ReviewAccountsPanel() {
  const t = useTranslations('internal-accounts.review_accounts');
  const queryClient = useQueryClient();
  const { copyToClipboard, isCopied } = useCopyToClipboard({ timeout: 2000 });
  const [createOpen, setCreateOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [kind, setKind] = useState<'review' | 'external'>('review');
  const [handoff, setHandoff] = useState<{
    email: string;
    password: string | null;
  } | null>(null);
  const [selected, setSelected] = useState<{
    account: ReviewAccount;
    action: Action;
  } | null>(null);
  const [confirmationEmail, setConfirmationEmail] = useState('');
  const [rotatedPassword, setRotatedPassword] = useState<string | null>(null);

  const accounts = useQuery({
    queryFn: () => listReviewAccounts(),
    queryKey: QUERY_KEY,
    staleTime: 15_000,
  });
  const create = useMutation({
    mutationFn: () =>
      createReviewAccount({
        email: email.trim(),
        displayName: displayName.trim(),
        kind,
      }),
    onSuccess: async (result) => {
      setHandoff({ email: result.email, password: result.password });
      await queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
    onError: () => toast.error(t('create_error')),
  });
  const update = useMutation({
    mutationFn: () =>
      updateReviewAccount(selected!.account.id, {
        action: selected!.action,
        confirmationEmail: confirmationEmail.trim(),
      }),
    onSuccess: async (result) => {
      if (result.password) setRotatedPassword(result.password);
      else closeAction();
      await queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast.success(t('updated'));
    },
    onError: () => toast.error(t('update_error')),
  });

  function closeCreate() {
    setCreateOpen(false);
    setEmail('');
    setDisplayName('');
    setKind('review');
    setHandoff(null);
    create.reset();
  }

  function closeAction() {
    setSelected(null);
    setConfirmationEmail('');
    setRotatedPassword(null);
    update.reset();
  }

  const handoffText = handoff?.password
    ? t('review_handoff', { email: handoff.email, password: handoff.password })
    : handoff
      ? t('external_handoff', { email: handoff.email })
      : '';
  const rotationText =
    selected && rotatedPassword
      ? t('review_handoff', {
          email: selected.account.email,
          password: rotatedPassword,
        })
      : '';
  const reviewNotes = t('review_notes');

  return (
    <section className="space-y-4 rounded-xl border bg-card p-4 shadow-xs">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">{t('title')}</h2>
          <p className="mt-1 max-w-2xl text-muted-foreground text-sm">
            {t('description')}
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} type="button">
          <Plus className="size-4" />
          {t('create')}
        </Button>
      </div>
      {accounts.isLoading ? (
        <p className="text-muted-foreground text-sm">{t('loading')}</p>
      ) : null}
      {accounts.isError ? (
        <Button onClick={() => void accounts.refetch()} variant="outline">
          <RefreshCw className="size-4" />
          {t('retry')}
        </Button>
      ) : null}
      {accounts.data?.accounts.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('empty')}</p>
      ) : null}
      {accounts.data?.accounts.map((account) => (
        <div
          className="flex flex-wrap items-center justify-between gap-3 border-t pt-3"
          key={account.id}
        >
          <div className="min-w-0">
            <p className="truncate font-medium">{account.email}</p>
            <p className="text-muted-foreground text-xs">
              {account.kind === 'review'
                ? t('review_kind')
                : t('external_kind')}
              {' · '}
              {account.isDisabled
                ? t('disabled')
                : account.emailConfirmed
                  ? t('ready')
                  : t('pending_invite')}
            </p>
          </div>
          <div className="flex gap-2">
            {account.kind === 'review' ? (
              <Button
                onClick={() =>
                  setSelected({ account, action: 'rotate_password' })
                }
                size="sm"
                variant="outline"
              >
                {t('rotate')}
              </Button>
            ) : null}
            <Button
              onClick={() =>
                setSelected({
                  account,
                  action: account.isDisabled ? 'enable' : 'disable',
                })
              }
              size="sm"
              variant="outline"
            >
              {account.isDisabled ? t('enable') : t('disable')}
            </Button>
          </div>
        </div>
      ))}

      <Dialog
        onOpenChange={(open) => {
          if (!open && !create.isPending) closeCreate();
        }}
        open={createOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {handoff ? t('created_title') : t('create_title')}
            </DialogTitle>
            <DialogDescription>
              {handoff ? t('one_time') : t('create_description')}
            </DialogDescription>
          </DialogHeader>
          {handoff ? (
            <div className="space-y-2">
              {handoff.password ? (
                <p className="text-muted-foreground text-sm">
                  {t('placement_help')}
                </p>
              ) : null}
              <Label htmlFor="review-handoff">{t('handoff_label')}</Label>
              <Textarea
                className="min-h-20 font-mono text-xs"
                id="review-handoff"
                readOnly
                value={handoffText}
              />
              {handoff.password ? (
                <>
                  <Label htmlFor="review-notes">{t('notes_label')}</Label>
                  <Textarea
                    className="min-h-32 text-sm"
                    id="review-notes"
                    readOnly
                    value={reviewNotes}
                  />
                  <Button
                    onClick={() => void copyToClipboard(reviewNotes)}
                    type="button"
                    variant="outline"
                  >
                    <Copy className="size-4" />
                    {t('copy_notes')}
                  </Button>
                </>
              ) : null}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex gap-2">
                <Button
                  onClick={() => setKind('review')}
                  type="button"
                  variant={kind === 'review' ? 'default' : 'outline'}
                >
                  {t('review_kind')}
                </Button>
                <Button
                  onClick={() => setKind('external')}
                  type="button"
                  variant={kind === 'external' ? 'default' : 'outline'}
                >
                  {t('external_kind')}
                </Button>
              </div>
              <p className="text-muted-foreground text-sm">
                {kind === 'review' ? t('review_help') : t('external_help')}
              </p>
              <div className="space-y-2">
                <Label htmlFor="review-name">{t('name')}</Label>
                <Input
                  id="review-name"
                  onChange={(event) => setDisplayName(event.target.value)}
                  value={displayName}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="review-email">{t('email')}</Label>
                <Input
                  autoComplete="off"
                  id="review-email"
                  onChange={(event) => setEmail(event.target.value)}
                  type="email"
                  value={email}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            {handoff ? (
              <>
                <Button
                  onClick={() => void copyToClipboard(handoffText)}
                  variant="outline"
                >
                  {isCopied ? (
                    <Check className="size-4" />
                  ) : (
                    <Copy className="size-4" />
                  )}
                  {t('copy_handoff')}
                </Button>
                <Button onClick={closeCreate}>{t('done')}</Button>
              </>
            ) : (
              <Button
                disabled={
                  create.isPending ||
                  !email.includes('@') ||
                  displayName.trim().length < 2
                }
                onClick={() => create.mutate()}
              >
                {create.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : null}
                {kind === 'review' ? t('create_review') : t('send_invite')}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        onOpenChange={(open) => {
          if (!open && !update.isPending) closeAction();
        }}
        open={Boolean(selected)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selected ? t(selected.action) : ''}</DialogTitle>
            <DialogDescription>
              {rotatedPassword ? t('one_time') : t('confirm_help')}
            </DialogDescription>
          </DialogHeader>
          {rotatedPassword ? (
            <div className="space-y-2">
              <p className="text-muted-foreground text-sm">
                {t('placement_help')}
              </p>
              <Textarea
                className="min-h-20 font-mono text-xs"
                readOnly
                value={rotationText}
              />
              <Label htmlFor="rotated-review-notes">{t('notes_label')}</Label>
              <Textarea
                className="min-h-32 text-sm"
                id="rotated-review-notes"
                readOnly
                value={reviewNotes}
              />
              <Button
                onClick={() => void copyToClipboard(reviewNotes)}
                type="button"
                variant="outline"
              >
                <Copy className="size-4" />
                {t('copy_notes')}
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="review-confirm-email">{t('confirm_email')}</Label>
              <Input
                autoComplete="off"
                id="review-confirm-email"
                onChange={(event) => setConfirmationEmail(event.target.value)}
                value={confirmationEmail}
              />
            </div>
          )}
          <DialogFooter>
            {rotatedPassword ? (
              <>
                <Button
                  onClick={() => void copyToClipboard(rotationText)}
                  variant="outline"
                >
                  <Copy className="size-4" />
                  {t('copy_handoff')}
                </Button>
                <Button onClick={closeAction}>{t('done')}</Button>
              </>
            ) : (
              <Button
                disabled={
                  update.isPending ||
                  confirmationEmail.trim().toLowerCase() !==
                    selected?.account.email.toLowerCase()
                }
                onClick={() => update.mutate()}
              >
                {update.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : null}
                {t('confirm')}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
