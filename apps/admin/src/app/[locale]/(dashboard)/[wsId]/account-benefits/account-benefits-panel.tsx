'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  grantAccountBenefit,
  listAccountBenefits,
  revokeAccountBenefit,
} from '@tuturuuu/internal-api/infrastructure';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
export function AccountBenefitsPanel({ actorId }: { actorId: string }) {
  const t = useTranslations('accountBenefits');
  const cache = useQueryClient();
  const [userId, setUserId] = useState('');
  const [key, setKey] = useState('feature.learn.playgrounds');
  const [amount, setAmount] = useState('1');
  const [reason, setReason] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const valid = /^[0-9a-f-]{36}$/i.test(userId);
  const queryKey = ['account-benefits', actorId, userId];
  const query = useQuery({
    queryKey,
    queryFn: () => listAccountBenefits(userId),
    enabled: valid,
    retry: false,
  });
  const grant = useMutation({
    mutationFn: () =>
      grantAccountBenefit({
        userId,
        key,
        amount: key === 'ai_credits' ? Number(amount) : 1,
        reason,
        expiresAt:
          key === 'ai_credits' || !expiresAt
            ? null
            : new Date(expiresAt).toISOString(),
        requestId,
      }),
    onSuccess: () => {
      setRequestId(crypto.randomUUID());
      void cache.invalidateQueries({ queryKey });
    },
  });
  const revoke = useMutation({
    mutationFn: (id: string) => revokeAccountBenefit(id),
    onSuccess: () => cache.invalidateQueries({ queryKey }),
  });
  const change = () => setRequestId(crypto.randomUUID());
  return (
    <section className="space-y-6">
      <header>
        <h1 className="font-semibold text-2xl">{t('title')}</h1>
        <p className="mt-2 text-muted-foreground">{t('description')}</p>
      </header>
      <form
        className="grid gap-4 rounded-xl border p-5 md:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          grant.mutate();
        }}
      >
        <Label className="space-y-2">
          {t('userId')}
          <Input
            required
            value={userId}
            onChange={(event) => {
              change();
              setUserId(event.target.value.trim());
            }}
          />
        </Label>
        <Label className="space-y-2">
          {t('benefit')}
          <Select
            value={
              key === 'ai_credits'
                ? 'ai_credits'
                : key.startsWith('early_access.')
                  ? 'early_access'
                  : 'feature'
            }
            onValueChange={(value) => {
              change();
              setKey(
                value === 'ai_credits'
                  ? 'ai_credits'
                  : value === 'early_access'
                    ? 'early_access.'
                    : 'feature.learn.playgrounds'
              );
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="feature">{t('feature')}</SelectItem>
              <SelectItem value="early_access">{t('earlyAccess')}</SelectItem>
              <SelectItem value="ai_credits">{t('credits')}</SelectItem>
            </SelectContent>
          </Select>
        </Label>
        {key !== 'ai_credits' ? (
          <Label className="space-y-2">
            {t('key')}
            <Input
              required
              value={key}
              onChange={(event) => {
                change();
                setKey(event.target.value);
              }}
            />
          </Label>
        ) : (
          <Label className="space-y-2">
            {t('amount')}
            <Input
              type="number"
              min={1}
              max={1000000}
              value={amount}
              onChange={(event) => {
                change();
                setAmount(event.target.value);
              }}
            />
          </Label>
        )}
        {key !== 'ai_credits' && (
          <Label className="space-y-2">
            {t('expiry')}
            <Input
              type="datetime-local"
              value={expiresAt}
              onChange={(event) => {
                change();
                setExpiresAt(event.target.value);
              }}
            />
          </Label>
        )}
        <Label className="space-y-2 md:col-span-2">
          {t('reason')}
          <Input
            required
            minLength={3}
            maxLength={500}
            value={reason}
            onChange={(event) => {
              change();
              setReason(event.target.value);
            }}
          />
        </Label>
        <Button type="submit" disabled={!valid || grant.isPending}>
          {t('grant')}
        </Button>
      </form>
      {(grant.isError || revoke.isError || query.isError) && (
        <p role="alert">{t('failed')}</p>
      )}
      <div className="space-y-3">
        {query.data?.map((benefit) => (
          <article
            key={benefit.id}
            className="flex flex-wrap items-center gap-3 rounded-lg border p-4"
          >
            <div className="mr-auto">
              <h2 className="font-medium">
                {benefit.benefit_key}
                {benefit.benefit_key === 'ai_credits'
                  ? ` +${benefit.amount}`
                  : ''}
              </h2>
              <p className="text-muted-foreground text-sm">{benefit.reason}</p>
              <p className="mt-1 text-muted-foreground text-xs">
                {benefit.created_at}
                {benefit.expires_at ? ` → ${benefit.expires_at}` : ''}
              </p>
            </div>
            <span className="text-sm">
              {t(
                benefit.revoked_at
                  ? 'revoked'
                  : benefit.expires_at &&
                      Date.parse(benefit.expires_at) <= Date.now()
                    ? 'expired'
                    : 'active'
              )}
            </span>
            {benefit.benefit_key !== 'ai_credits' && !benefit.revoked_at && (
              <Button
                variant="outline"
                size="sm"
                disabled={revoke.isPending}
                onClick={() => revoke.mutate(benefit.id)}
              >
                {t('revoke')}
              </Button>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
