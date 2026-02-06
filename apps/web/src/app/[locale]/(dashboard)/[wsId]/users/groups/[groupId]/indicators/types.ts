export interface GroupIndicator {
  id: string;
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
