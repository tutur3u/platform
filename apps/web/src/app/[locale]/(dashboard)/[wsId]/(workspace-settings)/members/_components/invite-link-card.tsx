'use client';

import { Check, Clock3, Copy, Pencil, Trash2, Users2 } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import moment from 'moment';
import { useTranslations } from 'next-intl';
import type { InviteLinkSummary } from '@/lib/workspace-invite-links';

type Props = {
  canManageMembers: boolean;
  copied: boolean;
  link: InviteLinkSummary;
  onCopy: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onViewMembers: () => void;
};

function StatusBadge({ link }: { link: InviteLinkSummary }) {
  const t = useTranslations();

  if (link.is_expired) {
    return (
      <Badge
        className="border-dynamic-red/30 text-dynamic-red"
        variant="outline"
      >
        {t('ws-invite-links.expired')}
      </Badge>
    );
  }
  if (link.is_full) {
    return (
      <Badge
        className="border-dynamic-orange/30 text-dynamic-orange"
        variant="outline"
      >
        {t('ws-invite-links.full')}
      </Badge>
    );
  }
  return (
    <Badge
      className="border-dynamic-green/30 text-dynamic-green"
      variant="outline"
    >
      {t('ws-invite-links.active')}
    </Badge>
  );
}

export function InviteLinkCard({
  canManageMembers,
  copied,
  link,
  onCopy,
  onDelete,
  onEdit,
  onViewMembers,
}: Props) {
  const t = useTranslations();
  const membershipLabel =
    link.memberType === 'GUEST'
      ? t('ws-invite-links.membership-short-guest')
      : t('ws-invite-links.membership-short-member');

  return (
    <article className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-3 md:px-5">
      <div className="min-w-48 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onCopy}
            className="min-w-0 max-w-full rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            title={t('ws-invite-links.copy-link')}
          >
            <code className="block truncate font-medium font-mono text-sm hover:underline">
              /invite/{link.code}
            </code>
          </button>
          <StatusBadge link={link} />
          <Badge variant="outline">{membershipLabel}</Badge>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground text-xs">
          <div className="flex items-center gap-1.5">
            <Users2 className="h-3.5 w-3.5" />
            <span className="font-medium text-foreground">
              {link.current_uses}
              {link.max_uses ? `/${link.max_uses}` : ''}
            </span>
            <span>{t('ws-invite-links.uses')}</span>
          </div>

          {link.expires_at ? (
            <div className="flex items-center gap-1.5">
              <Clock3 className="h-3.5 w-3.5" />
              <span className="font-medium text-foreground">
                {moment(link.expires_at).format('MMM D, YYYY')}
              </span>
              <span>{t('ws-invite-links.expires-at')}</span>
            </div>
          ) : null}

          <span>{moment(link.created_at).fromNow()}</span>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={onViewMembers}
          title={t('ws-invite-links.view-users')}
          aria-label={t('ws-invite-links.view-users')}
          className="h-8 gap-1 px-2"
        >
          <Users2 className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium text-xs">{link.current_uses}</span>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onCopy}
          title={t('ws-invite-links.copy-link')}
          aria-label={t('ws-invite-links.copy-link')}
          className="h-8 w-8"
        >
          {copied ? (
            <Check className="h-4 w-4 text-dynamic-green" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
        </Button>
        {canManageMembers ? (
          <>
            <Button
              variant="ghost"
              size="icon"
              onClick={onEdit}
              title={t('ws-invite-links.edit-link')}
              aria-label={t('ws-invite-links.edit-link')}
              className="h-8 w-8"
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onDelete}
              title={t('ws-invite-links.delete-link')}
              aria-label={t('ws-invite-links.delete-link')}
              className="h-8 w-8 text-dynamic-red hover:bg-dynamic-red/10 hover:text-dynamic-red"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </>
        ) : null}
      </div>
    </article>
  );
}
