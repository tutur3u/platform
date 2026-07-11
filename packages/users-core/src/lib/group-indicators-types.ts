export interface MetricCategory {
  id: string;
  name: string;
  description: string | null;
}

export interface GroupIndicator {
  categories: MetricCategory[];
  id: string;
  is_weighted: boolean;
  name: string;
  factor: number;
  unit: string;
}

export interface UserIndicator {
  user_id: string;
  indicator_id: string;
  value: number | null;
}

export interface PendingIndicatorValue {
  user_id: string;
  indicator_id: string;
  value: number | null;
}
