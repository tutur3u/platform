import type { Editor, JSONContent } from '@tiptap/react';
import type {
  InternalApiWorkspaceMember,
  TaskLabelSummary,
  TaskProject,
} from '@tuturuuu/types/db';
import type { TaskPriority } from '@tuturuuu/types/primitives/Priority';
import type { CalendarHoursType, Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import type { TaskFilters } from '../types';

export type WorkspaceTaskAssignee = InternalApiWorkspaceMember;
export type WorkspaceTaskProject = Pick<TaskProject, 'id' | 'name' | 'status'>;

export interface TaskEditDialogProps {
  wsId: string;
  task?: Task;
  boardId: string;
  isOpen: boolean;
  availableLists?: TaskList[];
  filters?: TaskFilters;
  mode?: 'edit' | 'create';
  collaborationMode?: boolean;
  isPersonalWorkspace?: boolean;
  currentUser?: {
    id: string;
    display_name?: string;
    email?: string;
    avatar_url?: string;
  };
  onClose: () => void;
  onUpdate: () => void;
}

export type WorkspaceTaskLabel = TaskLabelSummary;

export interface TaskFormState {
  name: string;
  description: JSONContent | null;
  priority: TaskPriority | null;
  startDate: Date | undefined;
  endDate: Date | undefined;
  selectedListId: string;
  estimationPoints: number | null | undefined;
  selectedLabels: WorkspaceTaskLabel[];
  selectedAssignees: WorkspaceTaskAssignee[];
  selectedProjects: WorkspaceTaskProject[];
  // Scheduling fields
  totalDuration: number | null;
  isSplittable: boolean;
  minSplitDurationMinutes: number | null;
  maxSplitDurationMinutes: number | null;
  calendarHours: CalendarHoursType | null;
  autoSchedule: boolean;
}

export interface EditorCallbacks {
  flushEditorPendingRef: React.MutableRefObject<
    (() => JSONContent | null) | undefined
  >;
  handleImageUpload: (file: File) => Promise<string>;
  handleEditorReady: (editor: Editor) => void;
}
