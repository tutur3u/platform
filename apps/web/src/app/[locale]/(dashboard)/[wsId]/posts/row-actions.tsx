'use client';

import { Badge } from '@tuturuuu/ui/badge';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import {
  getPostApprovalStatusAppearance,
  getPostEmailStatusAppearance,
} from './status-meta';
import type { PostEmail } from './types';

export default function PostsRowActions({ data }: { data: PostEmail }) {
  const t = useTranslations('post-email-data-table');
  const {
    icon: QueueIcon,
    className: queueClassName,
    iconClassName,
    labelKey: queueLabelKey,
  } = getPostEmailStatusAppearance(data.queue_status);

  const approvalAppearance = data.approval_status
    ? getPostApprovalStatusAppearance(data.approval_status)
    : null;

  return (
    <div className="flex flex-none items-center justify-end gap-1.5">
      {approvalAppearance && (
        <Badge
          variant="outline"
          className={cn('text-[10px]', approvalAppearance.className)}
        >
          <approvalAppearance.icon className="mr-0.5 h-3 w-3" />
          {t(approvalAppearance.labelKey)}
        </Badge>
      )}
      <Badge variant="outline" className={queueClassName}>
        <QueueIcon className={cn('mr-1 h-3.5 w-3.5', iconClassName)} />
        {t(queueLabelKey)}
      </Badge>
    </div>
  );
}
