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
      <Badge className="border-dynamic-red/20 bg-dynamic-red/10 text-dynamic-red">
        {t('ws-invite-links.expired')}
      </Badge>
    );
  }
  if (link.is_full) {
    return (
      <Badge className="border-dynamic-orange/20 bg-dynamic-orange/10 text-dynamic-orange">
        {t('ws-invite-links.full')}
      </Badge>
    );
  }
  return (
    <Badge className="border-dynamic-green/20 bg-dynamic-green/10 text-dynamic-green">
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
    <article className="group relative overflow-hidden rounded-2xl border border-border bg-background p-4 shadow-sm transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-md sm:p-5">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-dynamic-blue/50 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />

      <div className="relative space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge link={link} />
            <Badge
              className={
                link.memberType === 'GUEST'
                  ? 'border-dynamic-orange/20 bg-dynamic-orange/10 text-dynamic-orange'
                  : 'border-dynamic-blue/20 bg-dynamic-blue/10 text-dynamic-blue'
              }
            >
              {membershipLabel}
            </Badge>
          </div>

          <div className="flex items-center gap-1 rounded-lg border border-border bg-foreground/[0.02] p-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={onViewMembers}
              title={t('ws-invite-links.view-users')}
              aria-label={t('ws-invite-links.view-users')}
              className="h-7 gap-1 rounded-md px-2"
            >
              <Users2 className="h-3.5 w-3.5 text-dynamic-blue" />
              <span className="font-medium text-xs">{link.current_uses}</span>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onCopy}
              title={t('ws-invite-links.copy-link')}
              aria-label={t('ws-invite-links.copy-link')}
              className="h-7 w-7 rounded-md"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-dynamic-green" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
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
                  className="h-7 w-7 rounded-md"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onDelete}
                  title={t('ws-invite-links.delete-link')}
                  aria-label={t('ws-invite-links.delete-link')}
                  className="h-7 w-7 rounded-md text-dynamic-red hover:bg-dynamic-red/10 hover:text-dynamic-red"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </>
            ) : null}
          </div>
        </div>

        <button
          type="button"
          onClick={onCopy}
          className="flex w-full items-center gap-2 overflow-hidden rounded-xl border border-border bg-foreground/[0.025] px-3 py-2.5 text-left transition-colors hover:bg-foreground/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          title={t('ws-invite-links.copy-link')}
        >
          <Copy className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <code className="block truncate font-mono text-foreground/80 text-xs">
            /invite/{link.code}
          </code>
        </button>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-border border-t pt-3 text-xs">
          <div className="flex items-center gap-2">
            <Users2 className="h-3.5 w-3.5 text-dynamic-blue" />
            <span className="font-medium text-foreground">
              {link.current_uses}
              {link.max_uses ? `/${link.max_uses}` : ''}
            </span>
            <span className="text-muted-foreground">
              {t('ws-invite-links.uses')}
            </span>
          </div>

          {link.expires_at ? (
            <div className="flex items-center gap-2">
              <Clock3 className="h-3.5 w-3.5 text-dynamic-orange" />
              <span className="font-medium text-foreground">
                {moment(link.expires_at).format('MMM D, YYYY')}
              </span>
              <span className="text-muted-foreground">
                {t('ws-invite-links.expires-at')}
              </span>
            </div>
          ) : null}

          <span className="ml-auto text-muted-foreground">
            {moment(link.created_at).fromNow()}
          </span>
        </div>
      </div>
    </article>
  );
}
