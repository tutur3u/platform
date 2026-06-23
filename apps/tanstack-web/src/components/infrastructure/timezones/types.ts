import type {
  Timezone,
  TimezoneStatus,
} from '@tuturuuu/types/primitives/Timezone';

export type TimezoneManagementStatus = TimezoneStatus;

export type TimezoneManagementMetadata =
  | boolean
  | number
  | string
  | string[]
  | Record<string, unknown>
  | null
  | undefined;

export type TimezoneManagementRecord = Partial<
  Omit<Timezone, 'id' | 'status' | 'value'>
> & {
  id?: string | null;
  value: string;
  hours?: TimezoneManagementMetadata;
  priority?: TimezoneManagementMetadata;
  status?: TimezoneManagementStatus;
};

export type TimezoneManagementRow = TimezoneManagementRecord & {
  abbr: string;
  isdst: boolean;
  offset: number;
  source: 'catalog' | 'persisted';
  text: string;
  utc: string[];
};

export type TimezoneMutationPayload = {
  abbr?: string;
  hours?: TimezoneManagementMetadata;
  id?: string | null;
  isdst?: boolean;
  offset?: number;
  priority?: TimezoneManagementMetadata;
  status?: TimezoneManagementStatus;
  text?: string;
  utc?: string[];
  value: string;
};

export type TimezoneMutationResult =
  | TimezoneManagementRecord
  | null
  | undefined;

export type TimezoneCreateCallback = (
  payload: TimezoneMutationPayload
) => Promise<TimezoneMutationResult> | TimezoneMutationResult;

export type TimezoneUpdateCallback = (
  id: string,
  payload: TimezoneMutationPayload
) => Promise<TimezoneMutationResult> | TimezoneMutationResult;

export type TimezoneDeleteCallback = (
  id: string,
  row: TimezoneManagementRow
) => Promise<void> | void;

export type TimezoneRefreshCallback = () =>
  | Promise<TimezoneManagementRecord[] | null | undefined>
  | TimezoneManagementRecord[]
  | null
  | undefined;

export type TimezoneStatusFilter = 'all' | TimezoneManagementStatus;

export type TimezoneTableTranslator = ((key: string) => string) & {
  has?: (key: string) => boolean;
};

export type TimezoneManagementLabels = {
  actions: {
    cancel: string;
    create: string;
    delete: string;
    deleteDescription: string;
    deleteTitle: string;
    edit: string;
    resync: string;
    save: string;
    saving: string;
    sync: string;
  };
  columns: {
    abbr: string;
    createdAt: string;
    hours: string;
    id: string;
    isdst: string;
    offset: string;
    priority: string;
    status: string;
    text: string;
    utc: string;
    value: string;
  };
  dialog: {
    createDescription: string;
    createTitle: string;
    editDescription: string;
    editTitle: string;
  };
  filters: {
    allStatuses: string;
    status: string;
  };
  form: {
    abbr: string;
    hours: string;
    id: string;
    isdst: string;
    offset: string;
    priority: string;
    status: string;
    text: string;
    utc: string;
    utcDescription: string;
    value: string;
  };
  status: Record<TimezoneManagementStatus, string>;
  table: Record<string, string>;
  toasts: {
    createError: string;
    createSuccess: string;
    deleteError: string;
    deleteSuccess: string;
    refreshError: string;
    syncError: string;
    syncSuccess: string;
    updateError: string;
    updateSuccess: string;
  };
};

export type TimezoneManagementLabelOverrides = Partial<{
  [K in keyof TimezoneManagementLabels]: Partial<TimezoneManagementLabels[K]>;
}>;
