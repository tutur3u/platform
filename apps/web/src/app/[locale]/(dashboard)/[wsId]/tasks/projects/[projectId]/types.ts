import type { TaskProjectWithRelations, Workspace } from '@tuturuuu/types';
import type { Database } from '@tuturuuu/types/supabase';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import type { WorkspaceMember } from '@tuturuuu/ui/hooks/use-workspace-members';
import type { MotionProps } from 'framer-motion';

// Re-export WorkspaceMember for convenience
export type { WorkspaceMember };

export type TaskPriority = Database['public']['Enums']['task_priority'];
export type HealthStatus = 'on_track' | 'at_risk' | 'off_track';
export type ActiveTab = 'overview' | 'updates' | 'tasks';

export interface ProjectUpdate {
  id: string;
  content: string;
  creator_id: string;
  created_at: string | Date;
  updated_at?: string | Date;
  creator?: {
    display_name?: string;
    avatar_url?: string;
  };
  reactionGroups?: Array<{
    emoji: string;
    count: number;
  }>;
}

export interface TaskProjectDetailProps {
  workspace: Workspace;
  project: TaskProjectWithRelations;
  tasks: Task[];
  lists: TaskList[];
  currentUserId: string;
  wsId: string;
}

export interface UpdateCardProps {
  update: ProjectUpdate;
  currentUserId: string;
  isEditing: boolean;
  isDeleting: boolean;
  editingContent: string;
  onEdit: () => void;
  onDelete: () => void;
  onSave: () => void;
  onCancel: () => void;
  onContentChange: (content: string) => void;
  fadeInVariant: MotionProps;
}

export interface ProjectLeadSelectorProps {
  leadId: string | null;
  workspaceMembers: WorkspaceMember[];
  isLoading: boolean;
  onChange: (value: string | null) => void;
  compact?: boolean;
}
