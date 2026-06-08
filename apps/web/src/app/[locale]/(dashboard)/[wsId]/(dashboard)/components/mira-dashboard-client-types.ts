import type { ReactNode } from 'react';

export interface MiraDashboardClientProps {
  children?: ReactNode;
  currentUser: {
    avatar_url?: string | null;
    display_name?: string | null;
    email?: string | null;
    full_name?: string | null;
    id: string;
  };
  initialAssistantName: string;
  wsId: string;
}
