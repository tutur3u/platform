'use client';
import type { MailLabel } from '@tuturuuu/internal-api';
import { Badge } from '@tuturuuu/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { useTranslations } from 'next-intl';

export function MailLabelBadges({ labels }: { labels: MailLabel[] }) {
  const t = useTranslations('mail');
  if (labels.length > 2)
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            tabIndex={0}
            className="shrink-0 text-[0.68rem]"
            variant="secondary"
          >
            {t('tag_count', { count: labels.length })}
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-80">
          <div className="flex flex-wrap gap-1.5">
            {labels.map((label) => (
              <span
                key={label.id}
                className="rounded border border-current/20 px-1.5 py-0.5 text-xs"
              >
                {label.name}
              </span>
            ))}
          </div>
        </TooltipContent>
      </Tooltip>
    );
  return labels.map((label) => (
    <Badge
      className="max-w-40 gap-1.5 text-[0.68rem]"
      key={label.id}
      variant="secondary"
    >
      <span
        className="size-1.5 shrink-0 rounded-full bg-foreground/30"
        style={label.color ? { backgroundColor: label.color } : undefined}
      />
      <span className="truncate">{label.name}</span>
    </Badge>
  ));
}
