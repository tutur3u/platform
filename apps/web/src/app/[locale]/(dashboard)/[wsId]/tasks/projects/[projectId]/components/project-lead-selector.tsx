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
import { useTranslations } from 'next-intl';
import type { ProjectLeadSelectorProps } from '../types';

export function ProjectLeadSelector({
  leadId,
  workspaceMembers,
  isLoading,
  onChange,
  compact = false,
}: ProjectLeadSelectorProps) {
  const t = useTranslations('task_project_detail.lead_selector');
  return (
    <Select
      value={leadId || 'none'}
      onValueChange={(value) => onChange(value === 'none' ? null : value)}
    >
      <SelectTrigger
        className={cn(
          'border-dynamic-purple/30 bg-background/50',
          compact && 'h-9'
        )}
      >
        <SelectValue placeholder={isLoading ? t('loading') : t('select_lead')} />
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
                  {member.display_name?.[0]?.toUpperCase() || 'U'}
                </AvatarFallback>
              </Avatar>
              <span className="text-sm">
                {member.display_name || member.email}
              </span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
