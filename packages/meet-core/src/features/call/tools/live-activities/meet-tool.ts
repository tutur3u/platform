import type { ComponentType } from 'react';

export type MeetToolPanelProps = {
  meetingId?: string;
  role?: 'host' | 'participant';
  participantId?: string;
  onClose?: () => void;
};

export type MeetToolDefinition = {
  id: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  Panel: ComponentType<MeetToolPanelProps>;
};
