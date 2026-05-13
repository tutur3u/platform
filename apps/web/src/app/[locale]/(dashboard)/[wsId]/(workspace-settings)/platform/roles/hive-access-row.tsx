'use client';

import { FlaskConical, Loader2, ShieldCheck, UserX } from '@tuturuuu/icons';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Badge } from '@tuturuuu/ui/badge';
import { Switch } from '@tuturuuu/ui/switch';
import { generateFunName, getInitials } from '@tuturuuu/utils/name-helper';
import type { PlatformUserWithDetails } from './types';

type HiveAccessRowProps = {
  disabled: boolean;
  enabled: boolean;
  labels: {
    disabled: string;
    enabled: string;
    toggle: string;
  };
  locale: string;
  onToggle: (enabled: boolean) => void;
  pending: boolean;
  user: PlatformUserWithDetails;
};

export function HiveAccessRow({
  disabled,
  enabled,
  labels,
  locale,
  onToggle,
  pending,
  user,
}: HiveAccessRowProps) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-dynamic-border/70 bg-dynamic-background/70 p-3">
      <div className="flex min-w-0 items-center gap-3">
        <Avatar className="h-9 w-9 rounded-lg border">
          <AvatarImage
            alt={user.display_name || ''}
            src={user.avatar_url || ''}
          />
          <AvatarFallback className="rounded-lg text-xs">
            {getInitials(user.display_name || user.email || '?')}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <div className="truncate font-medium">
            {user.display_name || generateFunName({ id: user.id, locale })}
          </div>
          <div className="truncate text-dynamic-muted-foreground text-xs">
            {user.email || user.id}
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <Badge
          className={
            enabled
              ? 'border-dynamic-green/30 bg-dynamic-green/10 text-dynamic-green'
              : 'border-dynamic-border bg-dynamic-muted/40 text-dynamic-muted-foreground'
          }
          variant="outline"
        >
          {enabled ? (
            <ShieldCheck className="mr-1 h-3 w-3" />
          ) : user.enabled ? (
            <FlaskConical className="mr-1 h-3 w-3" />
          ) : (
            <UserX className="mr-1 h-3 w-3" />
          )}
          {enabled ? labels.enabled : labels.disabled}
        </Badge>
        <div className="relative">
          <Switch
            aria-label={labels.toggle}
            checked={enabled}
            disabled={disabled || pending}
            onCheckedChange={onToggle}
          />
          {pending && (
            <Loader2 className="absolute top-1/2 left-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 animate-spin text-dynamic-muted-foreground" />
          )}
        </div>
      </div>
    </div>
  );
}
