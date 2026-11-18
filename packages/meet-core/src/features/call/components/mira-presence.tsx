'use client';

import { AudioLines, MessageSquare } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { useTranslations } from 'next-intl';
import { MiraAvatar } from './mira-profile';

export function MiraModeTag({
  mode,
  compact = false,
}: {
  mode: 'chat' | 'live';
  compact?: boolean;
}) {
  const t = useTranslations('meet.call.miraEverywhere');
  const Icon = mode === 'chat' ? MessageSquare : AudioLines;
  return (
    <Badge
      variant="secondary"
      className="gap-1 rounded-full bg-dynamic-purple text-background"
    >
      <Icon aria-hidden className="size-3" />
      {t(compact ? `${mode}Mode` : `${mode}Tag`)}
    </Badge>
  );
}

export function MiraLiveDot({ avatar = false }: { avatar?: boolean }) {
  return (
    <span
      aria-hidden
      className="relative inline-grid shrink-0 place-items-center rounded-md"
    >
      {avatar ? (
        <MiraAvatar size={16} />
      ) : (
        <span className="size-2 rounded-full bg-dynamic-purple motion-reduce:border-2 motion-reduce:border-dynamic-purple motion-reduce:bg-transparent" />
      )}
      <span className="absolute -inset-0.5 rounded-[inherit] border border-dynamic-purple motion-safe:animate-ping motion-reduce:animate-none" />
    </span>
  );
}
