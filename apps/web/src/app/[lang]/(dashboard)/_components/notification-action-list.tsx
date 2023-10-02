'use client';

import { ReactNode, useState } from 'react';
import NotificationAction from './notification-action';

export enum NotificationActionType {
  WORKSPACE_INVITE_ACCEPT = 'WORKSPACE_INVITE_ACCEPT',
  WORKSPACE_INVITE_DECLINE = 'WORKSPACE_INVITE_DECLINE',
}

type buttonVariant =
  | 'default'
  | 'destructive'
  | 'outline'
  | 'secondary'
  | 'ghost'
  | 'link'
  | null;

export type NotificationAction = {
  label: ReactNode;
  variant?: buttonVariant;
  type?: NotificationActionType;
  payload?: any;
};

interface Props {
  actions?: NotificationAction[];
}

export default function NotificationActionList({ actions }: Props) {
  const [processingAction, setProcessingAction] = useState<string>();

  return (
    <div className="flex items-center gap-2">
      {actions?.map((action, index) => (
        <NotificationAction
          key={index}
          action={action}
          disabled={processingAction !== undefined}
          onStart={() => setProcessingAction(action.type)}
          onEnd={() => setProcessingAction(undefined)}
        />
      ))}
    </div>
  );
}
