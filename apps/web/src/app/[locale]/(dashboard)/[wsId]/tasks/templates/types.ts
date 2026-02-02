export interface BoardTemplate {
  id: string;
  wsId: string;
  createdBy: string | null;
  sourceBoardId: string | null;
  name: string;
  description: string | null;
  visibility: 'private' | 'workspace' | 'public';
  backgroundUrl?: string | null;
  createdAt: string;
  updatedAt: string;
  isOwner: boolean;
  stats: {
    lists: number;
    tasks: number;
    labels: number;
  };
}

export interface BoardTemplateWithContent extends BoardTemplate {
  content: TemplateContent;
}

export interface TemplateTask {
  name: string;
  description: string | null;
  priority: 'low' | 'normal' | 'high' | 'critical' | null;
  completed: boolean;
  start_date?: string | null;
  end_date?: string | null;
}

export interface TemplateList {
  name: string;
  status: string;
  color: string | null;
  position: number | null;
  archived: boolean;
  tasks: TemplateTask[];
}

export interface TemplateContent {
  lists: TemplateList[];
  labels: Array<{ name: string; color: string }>;
  settings: {
    estimation_type?: string | null;
    allow_zero_estimates?: boolean | null;
    extended_estimation?: boolean | null;
  };
}

export type TemplateFilter = 'private' | 'workspace' | 'public';
