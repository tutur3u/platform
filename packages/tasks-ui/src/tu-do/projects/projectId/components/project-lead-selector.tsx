'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { cn } from '@tuturuuu/utils/format';
import { resolveUserDisplayName } from '@tuturuuu/utils/name-helper';
import { useTranslations } from 'next-intl';
import { LoadSelect } from '../../../shared/load-select';
import type { ProjectLeadSelectorProps } from '../types';

export function ProjectLeadSelector({
  leadId,
  workspaceMembers,
  isLoading,
  onChange,
  compact = false,
}: ProjectLeadSelectorProps) {
  const t = useTranslations('task_project_detail.lead_selector');
  if (isLoading) return <LoadSelect srLabel={t('loading')} />;
  return (
    <Select
      value={leadId || 'none'}
      onValueChange={(value) => onChange(value === 'none' ? null : value)}
    >
      <SelectTrigger className={cn('bg-background', compact && 'h-9')}>
        <SelectValue placeholder={t('select_lead')} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">
          <span className="text-muted-foreground italic">{t('no_lead')}</span>
        </SelectItem>
        {workspaceMembers.map((member) => (
          <SelectItem key={member.id} value={member.id}>
            <div className="flex items-center gap-2">
              <Avatar className="h-5 w-5">
                <AvatarImage src={member.avatar_url || undefined} />
                <AvatarFallback className="text-xs">
                  {resolveUserDisplayName(member)[0]?.toUpperCase() || 'U'}
                </AvatarFallback>
              </Avatar>
              <span className="text-sm">{resolveUserDisplayName(member)}</span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
