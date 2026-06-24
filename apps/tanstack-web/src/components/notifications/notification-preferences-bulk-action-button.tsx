'use client';

import { Loader2 } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'use-intl';

type BulkAction = 'disable_all' | 'enable_all';

type NotificationPreferencesBulkActionButtonProps = {
  action: BulkAction;
  disabled: boolean;
  groupId: string;
  loadingState?: BulkAction;
  onAction: (groupId: string, action: BulkAction) => void;
};

export function NotificationPreferencesBulkActionButton({
  action,
  disabled,
  groupId,
  loadingState,
  onAction,
}: NotificationPreferencesBulkActionButtonProps) {
  const t = useTranslations('notifications.settings');

  return (
    <Button
      className="h-7 text-xs"
      disabled={disabled}
      onClick={() => onAction(groupId, action)}
      size="sm"
      variant="ghost"
    >
      {loadingState === action ? (
        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
      ) : null}
      {t(action === 'enable_all' ? 'enable-all' : 'disable-all')}
    </Button>
  );
}
