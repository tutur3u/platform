import type { ComponentType } from 'react';

export type MeetToolDefinition = {
  id: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  Panel: ComponentType;
};