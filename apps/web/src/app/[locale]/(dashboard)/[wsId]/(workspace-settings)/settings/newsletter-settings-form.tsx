'use client';

import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import {
  createNewsletterClaimAction,
  type NewsletterClaimActionState,
  type NewsletterDnsRow,
} from './newsletter-actions';

type ClaimProps = {
  approval: string;
  dkimVerified: boolean;
  dnsRecords: NewsletterDnsRow[];
  mailFromVerified: boolean;
  subdomain: string;
  txtVerified: boolean;
};

function purposeLabel(
  purpose: string,
  t: ReturnType<typeof useTranslations<'ws-settings.newsletter'>>
): string {
  switch (purpose) {
    case 'ownership':
      return t('purpose_ownership');
    case 'dkim':
      return t('purpose_dkim');
    case 'mail_from_spf':
      return t('purpose_mail_from_spf');
    case 'mail_from_mx':
      return t('purpose_mail_from_mx');
    default:
      return purpose;
  }
}

const initialState: NewsletterClaimActionState = { status: 'idle' };

export default function NewsletterSettingsForm({
  allowed,
  claim,
  loadError,
  wsId,
}: {
  allowed: boolean;
  claim: ClaimProps | null;
  loadError: boolean;
  wsId: string;
}) {
  const t = useTranslations('ws-settings.newsletter');
  const [state, action, pending] = useActionState(
    createNewsletterClaimAction.bind(null, wsId),
    initialState
  );
  const saved = state.status === 'saved';
  const subdomain = saved ? state.subdomain : claim?.subdomain;
  const approval = saved ? state.approval : claim?.approval;
  const records = saved ? state.records : claim?.dnsRecords;
  const verification = saved
    ? {
        dkim: state.dkimVerified === true,
        mailFrom: state.mailFromVerified === true,
        txt: state.txtVerified === true,
      }
    : claim
      ? {
          dkim: claim.dkimVerified,
          mailFrom: claim.mailFromVerified,
          txt: claim.txtVerified,
        }
      : null;
  const showForm = !loadError && !subdomain;
  const verificationRows: Array<[string, boolean]> = verification
    ? [
        [t('status_dkim'), verification.dkim],
        [t('status_mail_from'), verification.mailFrom],
        [t('status_txt'), verification.txt],
      ]
    : [];

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-border bg-foreground/5 p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-lg">{t('title')}</h2>
          <p className="text-muted-foreground text-sm">{t('description')}</p>
        </div>
        <Badge
          variant={
            allowed && !saved
              ? 'success'
              : approval === 'pending'
                ? 'warning'
                : 'error'
          }
        >
          {allowed && !saved
            ? t('allowed')
            : approval === 'pending'
              ? t('pending')
              : t('blocked')}
        </Badge>
      </div>
      {loadError ? <p className="text-sm">{t('save_error')}</p> : null}
      {showForm ? (
        <p className="text-muted-foreground text-sm">{t('empty')}</p>
      ) : null}
      {saved ? <p className="text-sm">{t('saved')}</p> : null}
      {showForm ? (
        <form action={action} className="flex flex-col gap-3">
          <Label htmlFor="newsletter-subdomain">{t('subdomain_label')}</Label>
          <Input
            autoComplete="off"
            id="newsletter-subdomain"
            maxLength={253}
            name="subdomain"
            placeholder="news.example.com"
            required
            spellCheck={false}
          />
          <Button disabled={pending} type="submit">
            {pending ? t('saving') : t('save')}
          </Button>
          {state.status === 'error' ? (
            <p className="text-sm">{t('save_error')}</p>
          ) : null}
        </form>
      ) : null}
      {subdomain ? <p className="font-mono text-sm">{subdomain}</p> : null}
      {subdomain && verification ? (
        <div className="flex flex-col gap-2">
          <h3 className="font-medium text-sm">{t('status_heading')}</h3>
          <ul className="flex flex-col gap-1">
            {verificationRows.map(([label, verified]) => (
              <li
                className="flex items-center justify-between gap-3 text-sm"
                key={label}
              >
                <span>{label}</span>
                <span>
                  {verified ? t('status_verified') : t('status_pending')}
                </span>
              </li>
            ))}
          </ul>
          {verificationRows.some(([, verified]) => !verified) ? (
            <p className="text-muted-foreground text-sm">
              {t('status_pending_hint')}
            </p>
          ) : null}
        </div>
      ) : null}
      {state.token ? (
        <div className="flex flex-col gap-1">
          <p className="text-sm">{t('token_once')}</p>
          <p className="font-mono text-sm break-all">{state.token}</p>
          <p className="text-muted-foreground text-sm">{t('token_hint')}</p>
        </div>
      ) : null}
      {records && records.length > 0 ? (
        <div className="overflow-x-auto">
          <h3 className="mb-2 font-medium text-sm">{t('dns')}</h3>
          <p className="mb-2 text-muted-foreground text-sm">
            {t('dns_instructions')}
          </p>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-1 pr-3">{t('purpose')}</th>
                <th className="py-1 pr-3">{t('host')}</th>
                <th className="py-1 pr-3">{t('type')}</th>
                <th className="py-1">{t('value')}</th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => (
                <tr
                  className="border-border border-t"
                  key={`${record.purpose}-${record.type}-${record.host}`}
                >
                  <td className="py-2 pr-3">
                    {purposeLabel(record.purpose, t)}
                  </td>
                  <td className="py-2 pr-3 font-mono text-xs break-all">
                    {record.host}
                  </td>
                  <td className="py-2 pr-3">{record.type}</td>
                  <td className="py-2 font-mono text-xs break-all">
                    {record.value ?? t('value_hidden')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
