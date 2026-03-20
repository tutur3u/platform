'use client';

import { Badge } from '@tuturuuu/ui/badge';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { getPostEmailStatusAppearance } from './status-meta';
import type { PostEmail } from './types';

export default function PostsRowActions({ data }: { data: PostEmail }) {
  const t = useTranslations('post-email-data-table');
  const {
    icon: Icon,
    className,
    iconClassName,
    labelKey,
  } = getPostEmailStatusAppearance(data.queue_status);

  return (
    <div className="flex flex-none items-center justify-end gap-2">
      <Badge variant="outline" className={className}>
        <Icon className={cn('mr-1 h-3.5 w-3.5', iconClassName)} />
        {t(labelKey)}
      </Badge>
    </div>
  );
}
