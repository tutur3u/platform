import { Mail, Phone } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { cn } from '@tuturuuu/utils/format';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { RequireAttentionName } from '@/components/users/require-attention-name';
import { ResolvedUserAvatar } from './resolved-user-avatar';
import type { UserDetail, UserDetailMetric } from './types';

export function ProfileHeader({
  wsId,
  user,
  isGuest,
  metrics,
  actions,
  labels,
}: {
  wsId: string;
  user: UserDetail;
  isGuest: boolean;
  metrics: UserDetailMetric[];
  actions?: ReactNode;
  labels: {
    email: string;
    guest: string;
    phone: string;
    referredBy: string;
    unknownUser: string;
  };
}) {
  const primaryName = user.full_name || user.display_name || labels.unknownUser;
  const secondaryName =
    user.display_name && user.display_name !== primaryName
      ? user.display_name
      : null;
  const contactItems = [
    user.email
      ? { icon: Mail, label: labels.email, value: user.email }
      : undefined,
    user.phone
      ? { icon: Phone, label: labels.phone, value: user.phone }
      : undefined,
  ].filter(
    (
      item
    ): item is {
      icon: typeof Mail;
      label: string;
      value: string;
    } => Boolean(item)
  );

  return (
    <section className="rounded-xl border border-dynamic-border bg-card/80 p-4 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 flex-1 gap-4">
          <ResolvedUserAvatar
            src={user.avatar_url}
            alt={primaryName}
            width={88}
            height={88}
            loading="lazy"
            className="hidden size-20 shrink-0 rounded-xl border border-dynamic-border bg-muted/30 sm:block"
          />

          <div className="min-w-0 flex-1">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              {isGuest && (
                <Badge
                  variant="outline"
                  className="border-dynamic-orange/30 bg-dynamic-orange/10 text-dynamic-orange"
                >
                  {labels.guest}
                </Badge>
              )}
              {user.referrer?.id && (
                <Link
                  href={`/${wsId}/users/database/${user.referrer.id}`}
                  className="inline-flex min-w-0 items-center gap-1 rounded-full border border-dynamic-border bg-muted/30 px-2.5 py-1 text-sm transition-colors hover:bg-muted/60"
                >
                  <span className="shrink-0 text-muted-foreground">
                    {labels.referredBy}
                  </span>
                  <span className="truncate font-medium">
                    <RequireAttentionName
                      name={user.referrer.display_name || labels.unknownUser}
                      requireAttention={
                        !!user.referrer.has_require_attention_feedback
                      }
                    />
                  </span>
                </Link>
              )}
            </div>

            <h1 className="truncate font-semibold text-2xl tracking-normal md:text-3xl">
              <RequireAttentionName
                name={primaryName}
                requireAttention={!!user.has_require_attention_feedback}
              />
            </h1>
            {secondaryName && (
              <p className="mt-1 truncate text-muted-foreground text-sm">
                {secondaryName}
              </p>
            )}

            {contactItems.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {contactItems.map(({ icon: Icon, label, value }) => (
                  <div
                    key={label}
                    className="inline-flex max-w-full items-center gap-2 rounded-lg border border-dynamic-border bg-muted/20 px-2.5 py-1.5 text-sm"
                  >
                    <Icon className="size-4 shrink-0 text-muted-foreground" />
                    <span className="text-muted-foreground">{label}</span>
                    <span className="truncate font-medium">{value}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {actions && <div className="shrink-0">{actions}</div>}
      </div>

      {metrics.length > 0 && (
        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {metrics.map((metric) => (
            <MetricTile key={metric.label} metric={metric} />
          ))}
        </div>
      )}
    </section>
  );
}

function MetricTile({ metric }: { metric: UserDetailMetric }) {
  return (
    <div
      className={cn(
        'rounded-lg border border-dynamic-border bg-background/70 px-3 py-2',
        'shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]'
      )}
    >
      <div className="text-muted-foreground text-xs">{metric.label}</div>
      <div className="mt-1 font-semibold text-xl">{metric.value}</div>
      {metric.description && (
        <div className="mt-0.5 text-muted-foreground text-xs">
          {metric.description}
        </div>
      )}
    </div>
  );
}
