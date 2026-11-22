'use client';

import {
  AppWindow,
  ChevronDown,
  LogOut,
  Monitor,
  Smartphone,
  SquareTerminal,
  Tablet,
} from '@tuturuuu/icons';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@tuturuuu/ui/alert-dialog';
import { Button } from '@tuturuuu/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@tuturuuu/ui/collapsible';
import { SettingItemTab } from '@tuturuuu/ui/custom/settings-item-tab';
import { cn } from '@tuturuuu/utils/format';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  maskSessionIp,
  sessionIpAddress,
} from '@/lib/sessions/session-display';
import {
  describeSessionUserAgent,
  type SessionUserAgentDescription,
} from '@/lib/sessions/session-user-agent';

export interface SessionRowData {
  session_id: string;
  created_at: string;
  updated_at: string;
  user_agent: string;
  ip: string;
  is_current: boolean;
}

function ClientIcon({ client }: { client: SessionUserAgentDescription }) {
  if (client.kind === 'desktop-app') return <AppWindow className="h-4 w-4" />;
  if (client.kind === 'tool') return <SquareTerminal className="h-4 w-4" />;
  if (client.device === 'phone') return <Smartphone className="h-4 w-4" />;
  if (client.device === 'tablet') return <Tablet className="h-4 w-4" />;
  return <Monitor className="h-4 w-4" />;
}

function validDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatSessionClientLabel(
  client: SessionUserAgentDescription,
  t: ReturnType<typeof useTranslations<'sessions-card'>>
) {
  const name =
    client.kind === 'tuturuuu-app'
      ? t('tuturuuu_app')
      : client.kind === 'desktop-app'
        ? (client.name ?? t('desktop_app'))
        : client.name;
  if (name) {
    return client.platform
      ? t('client_on', { client: name, platform: client.platform })
      : name;
  }
  return client.platform
    ? t('client_on', {
        client: t('unknown_device'),
        platform: client.platform,
      })
    : t('unknown_device');
}

/**
 * One signed-in session: a friendly client label, the masked address and a
 * relative last-active time, with the full address, timestamps and raw user
 * agent behind a details disclosure.
 */
export function SessionRow({
  session,
  lastActive,
  identifier,
  revoking,
  onRevoke,
}: {
  session: SessionRowData;
  lastActive: string;
  identifier?: string;
  revoking: boolean;
  onRevoke: () => void;
}) {
  const t = useTranslations('sessions-card');
  const tCommon = useTranslations('common');
  const format = useFormatter();
  const [open, setOpen] = useState(false);

  const client = describeSessionUserAgent(session.user_agent);
  const label = formatSessionClientLabel(client, t);
  const accessibleLabel = identifier ?? label;

  const masked = maskSessionIp(session.ip);
  const address = sessionIpAddress(session.ip);
  const updatedAt = validDate(session.updated_at);
  const createdAt = validDate(session.created_at);
  const absolute = (date: Date) =>
    format.dateTime(date, { dateStyle: 'medium', timeStyle: 'short' });

  const details: { term: string; value: string; mono?: boolean }[] = [
    ...(updatedAt
      ? [{ term: t('last_active'), value: absolute(updatedAt) }]
      : []),
    ...(createdAt
      ? [{ term: t('signed_in'), value: absolute(createdAt) }]
      : []),
    ...(address ? [{ term: t('ip_address'), value: address, mono: true }] : []),
    ...(session.user_agent?.trim()
      ? [{ term: t('user_agent'), value: session.user_agent, mono: true }]
      : []),
  ];

  return (
    <SettingItemTab
      layout="compact"
      icon={<ClientIcon client={client} />}
      title={label}
      description={
        <Collapsible open={open} onOpenChange={setOpen}>
          <span>
            {masked && <span className="tabular-nums">{masked} · </span>}
            {t('last_active')}{' '}
            {updatedAt ? (
              <time
                dateTime={updatedAt.toISOString()}
                title={absolute(updatedAt)}
              >
                {lastActive}
              </time>
            ) : (
              lastActive
            )}
          </span>
          {details.length > 0 && (
            <>
              <CollapsibleTrigger asChild>
                <Button
                  variant="link"
                  size="sm"
                  className="ml-1 h-auto gap-1 p-0 align-baseline text-muted-foreground hover:text-foreground"
                  aria-label={
                    open
                      ? t('hide_details_named', { label: accessibleLabel })
                      : t('details_named', { label: accessibleLabel })
                  }
                >
                  {open ? t('hide_details') : t('details')}
                  <ChevronDown
                    aria-hidden
                    className={cn(
                      'h-3.5 w-3.5 transition-transform',
                      open && 'rotate-180'
                    )}
                  />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
                  {details.map((item) => (
                    <div className="contents" key={item.term}>
                      <dt className="text-muted-foreground">{item.term}</dt>
                      <dd
                        className={cn(
                          'min-w-0 break-all text-foreground',
                          item.mono && 'font-mono'
                        )}
                      >
                        {item.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </CollapsibleContent>
            </>
          )}
        </Collapsible>
      }
    >
      {!session.is_current && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-9 w-9 p-0 text-muted-foreground hover:text-destructive"
              disabled={revoking}
              aria-label={
                revoking
                  ? t('revoking')
                  : t('revoke_named', { label: accessibleLabel })
              }
              title={t('revoke_named', { label: accessibleLabel })}
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {t('revoke_session_named_question', {
                  label: accessibleLabel,
                })}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {t('revoke_session_description')}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{tCommon('cancel')}</AlertDialogCancel>
              <AlertDialogAction onClick={onRevoke}>
                {t('revoke_session')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </SettingItemTab>
  );
}
