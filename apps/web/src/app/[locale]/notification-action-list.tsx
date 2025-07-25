'use client';

import Action from './notification-action';
import { type ReactNode, useState } from 'react';

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
          onStart={() => setProcessingAction(action.type)}
          onError={() => setProcessingAction(undefined)}
        />
      ))}
    </div>
  );
}
