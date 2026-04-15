import type { Editor, JSONContent } from '@tiptap/react';
import type { TaskLabelSummary } from '@tuturuuu/types';
import type { CalendarHoursType, Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import type { TaskFilters } from '../types';

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
  priority: any | null;
  startDate: Date | undefined;
  endDate: Date | undefined;
  selectedListId: string;
  estimationPoints: number | null | undefined;
  selectedLabels: WorkspaceTaskLabel[];
  selectedAssignees: any[];
  selectedProjects: any[];
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
