'use client';

import { Button } from '@/components/ui/button';
import { NotificationAction } from './notification-action-list';
import { useRouter } from 'next/navigation';

interface Props {
  action: NotificationAction;
  onStart?: () => void;
  onEnd?: () => void;
  onSuccess?: () => void;
  onError?: () => void;
  disabled?: boolean;
}

export default function NotificationAction({
  action: { label, variant, type, payload },
  onStart,
  onEnd,
  onSuccess,
  onError,
  disabled,
}: Props) {
  const router = useRouter();

  const handleWorkspaceInvite = async ({
    data,
    accept,
  }: {
    data: { wsId: string };
    accept: boolean;
  }) => {
    onStart?.();

    const { wsId } = data;
    const url = `/api/workspaces/${wsId}/${
      accept ? 'accept-invite' : 'decline-invite'
    }`;

    const res = await fetch(url, {
      method: 'POST',
    });

    if (res.ok) {
      onSuccess?.();
      onEnd?.();
      router.refresh();
      return;
    }

    onError?.();
    onEnd?.();
  };

  const handleClick = () => {
    switch (type) {
      case 'WORKSPACE_INVITE_ACCEPT':
        handleWorkspaceInvite({ data: payload, accept: true });
        break;

      case 'WORKSPACE_INVITE_DECLINE':
        handleWorkspaceInvite({ data: payload, accept: false });
        break;

      default:
        break;
    }
  };

  return (
    <Button
      variant={variant}
      size="sm"
      onClick={handleClick}
      className={!variant ? 'w-full' : 'flex-none'}
      disabled={disabled}
    >
      {label}
    </Button>
  );
}
