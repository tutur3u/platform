'use client';

import Action from './notification-action';
import { toast } from '@tuturuuu/ui/sonner';
import { useRouter } from 'next/navigation';
import { ReactNode, useState } from 'react';

type buttonVariant =
  | 'default'
  | 'destructive'
  | 'outline'
  | 'secondary'
  | 'ghost'
  | 'link'
  | null;

export type NotificationAction = {
  id: string;
  label: ReactNode;
  variant?: buttonVariant;
  type?: 'WORKSPACE_INVITE_ACCEPT' | 'WORKSPACE_INVITE_DECLINE';
  payload?: any;
};

interface Props {
  actions?: NotificationAction[];
}

export default function NotificationActionList({ actions }: Props) {
  const [processingAction, setProcessingAction] = useState<string>();

  return (
    <div className="flex items-center gap-2">
      {actions?.map((action) => (
        <Action
          key={action.id}
          action={action}
          disabled={processingAction !== undefined}
          onStart={() => {
            if (action.type == 'WORKSPACE_INVITE_DECLINE') {
              toast.success('You declined workspace invite...');
            } else if (action.type == 'WORKSPACE_INVITE_ACCEPT') {
              toast.success('You accepted workspace invite...');
            }
            setProcessingAction(action.type);
          }}
          onError={() => {
            toast.error('Something went wrong');
            setProcessingAction(undefined);
          }}
        />
      ))}
    </div>
  );
}
