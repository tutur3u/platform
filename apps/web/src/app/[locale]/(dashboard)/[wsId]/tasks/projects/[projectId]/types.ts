import type {
  ProjectUpdate,
  TaskProjectWithRelations,
  Workspace,
} from '@tuturuuu/types';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import type { Database } from '@tuturuuu/types/supabase';
import type { WorkspaceMember } from '@tuturuuu/ui/hooks/use-workspace-members';
import type { MotionProps } from 'framer-motion';

// Re-export WorkspaceMember for convenience
export type { WorkspaceMember };

// Re-export ProjectUpdate from centralized types
export type { ProjectUpdate };

export type TaskPriority = Database['public']['Enums']['task_priority'];
export type HealthStatus = 'on_track' | 'at_risk' | 'off_track';
export type ActiveTab = 'overview' | 'updates' | 'tasks';

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
