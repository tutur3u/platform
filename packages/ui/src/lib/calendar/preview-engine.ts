export interface PreviewEvent {
  id: string;
  title: string;
  start_at: string;
  end_at: string;
  type: 'habit' | 'task' | 'break';
  source_id: string;
  color?: string;
  isPreview: true;
  step: number;
  occurrence_date?: string;
  scheduled_minutes?: number;
  is_reused?: boolean;
}
