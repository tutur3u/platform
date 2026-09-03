import type { TimeTrackingCategory } from '@tuturuuu/types';
import type {
  ExtendedWorkspaceTask,
  SessionWithRelations,
} from '@tuturuuu/ui/time-tracker/types';
import type { SessionTemplate } from './components/new-session-support';

export interface TaskBoard {
  id: string;
  name: string;
  task_lists: { id: string; name: string; color: string }[];
}

export interface NewSessionFormProps {
  sessionMode: 'task' | 'manual';
  onSessionModeChange: (mode: 'task' | 'manual') => void;
  newSessionTitle: string;
  setNewSessionTitle: (value: string) => void;
  newSessionDescription: string;
  setNewSessionDescription: (value: string) => void;
  selectedCategoryId: string;
  setSelectedCategoryId: (value: string) => void;
  selectedTaskId: string;
  onTaskSelectionChange: (taskId: string) => void;
  showTaskSuggestion: boolean;
  onManualTitleChange: (title: string) => void;
  onCreateTaskFromManual: () => void;
  onStartTimer: () => void;
  isLoading: boolean;
  tasks: ExtendedWorkspaceTask[];
  categories: TimeTrackingCategory[];
  recentSessions: SessionWithRelations[];
  templates: SessionTemplate[];
  onDuplicate: (session: SessionWithRelations) => void;
  onTemplate: (template: SessionTemplate) => void;
}
