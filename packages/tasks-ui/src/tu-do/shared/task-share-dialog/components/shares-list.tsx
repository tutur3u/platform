'use client';

import { Mail, User, X } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { useTranslations } from 'next-intl';
import type { TaskShare } from '../hooks/use-task-sharing';

interface SharesListProps {
  shares: TaskShare[];
  onUpdatePermission: (shareId: string, permission: 'view' | 'edit') => void;
  onRemoveShare: (shareId: string) => void;
}

export function SharesList({
  shares,
  onUpdatePermission,
  onRemoveShare,
}: SharesListProps) {
  const t = useTranslations();

  if (shares.length === 0) return null;

  return (
    <div className="space-y-2">
      <Label>{t('common.task_sharing.people_with_access')}</Label>
      <div className="space-y-2 rounded-lg border p-2">
        {shares.map((share) => (
          <div
            key={share.id}
            className="flex items-center justify-between gap-2 rounded-md p-2 hover:bg-muted/50"
          >
            <div className="flex items-center gap-2">
              {share.shared_with_email ? (
                <Mail className="h-4 w-4 text-muted-foreground" />
              ) : (
                <User className="h-4 w-4 text-muted-foreground" />
              )}
              <span className="text-sm">
                {share.users?.display_name ||
                  share.users?.handle ||
                  share.shared_with_email}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Select
                value={share.permission}
                onValueChange={(value: 'view' | 'edit') =>
                  onUpdatePermission(share.id, value)
                }
              >
                <SelectTrigger className="h-8 w-25">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="view">
                    {t('common.task_sharing.viewer')}
                  </SelectItem>
                  <SelectItem value="edit">
                    {t('common.task_sharing.editor')}
                  </SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => onRemoveShare(share.id)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
