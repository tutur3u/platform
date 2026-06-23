import type {
  TimezoneManagementLabelOverrides,
  TimezoneManagementLabels,
} from './types';

export const DEFAULT_TIMEZONE_LABELS: TimezoneManagementLabels = {
  actions: {
    cancel: 'Cancel',
    create: 'Add timezone',
    delete: 'Delete',
    deleteDescription:
      'This removes the persisted timezone record. The catalog timezone will remain available to sync again.',
    deleteTitle: 'Delete timezone',
    edit: 'Edit',
    resync: 'Resync',
    save: 'Save',
    saving: 'Saving...',
    sync: 'Sync',
  },
  columns: {
    abbr: 'Abbreviation',
    createdAt: 'Created at',
    hours: 'Hours',
    id: 'ID',
    isdst: 'DST',
    offset: 'Offset',
    priority: 'Priority',
    status: 'Status',
    text: 'Text',
    utc: 'UTC zones',
    value: 'Value',
  },
  dialog: {
    createDescription: 'Create a custom timezone synchronization record.',
    createTitle: 'Add timezone',
    editDescription: 'Update the persisted timezone synchronization record.',
    editTitle: 'Edit timezone',
  },
  filters: {
    allStatuses: 'All statuses',
    status: 'Status',
  },
  form: {
    abbr: 'Abbreviation',
    hours: 'Hours',
    id: 'ID',
    isdst: 'Daylight saving time',
    offset: 'Offset',
    priority: 'Priority',
    status: 'Status',
    text: 'Text',
    utc: 'UTC zones',
    utcDescription: 'Separate UTC zone identifiers with commas.',
    value: 'Value',
  },
  status: {
    error: 'Error',
    outdated: 'Outdated',
    pending: 'Pending',
    synced: 'Synced',
  },
  table: {
    'common.loading': 'Loading',
    'common.no-results': 'No results',
    'common.of': 'of',
    'common.page': 'Page',
    'common.refresh': 'Refresh',
    'common.reset': 'Reset',
    'common.result(s)': 'result(s)',
    'common.rows-per-page': 'Rows per page',
  },
  toasts: {
    createError: 'Failed to create timezone.',
    createSuccess: 'Timezone queued for sync.',
    deleteError: 'Failed to delete timezone.',
    deleteSuccess: 'Timezone deleted.',
    refreshError: 'Failed to refresh timezones.',
    syncError: 'Failed to sync timezone.',
    syncSuccess: 'Timezone synced.',
    updateError: 'Failed to update timezone.',
    updateSuccess: 'Timezone updated.',
  },
};

export function resolveTimezoneLabels(
  overrides?: TimezoneManagementLabelOverrides
): TimezoneManagementLabels {
  return {
    actions: {
      ...DEFAULT_TIMEZONE_LABELS.actions,
      ...overrides?.actions,
    },
    columns: {
      ...DEFAULT_TIMEZONE_LABELS.columns,
      ...overrides?.columns,
    },
    dialog: {
      ...DEFAULT_TIMEZONE_LABELS.dialog,
      ...overrides?.dialog,
    },
    filters: {
      ...DEFAULT_TIMEZONE_LABELS.filters,
      ...overrides?.filters,
    },
    form: {
      ...DEFAULT_TIMEZONE_LABELS.form,
      ...overrides?.form,
    },
    status: {
      ...DEFAULT_TIMEZONE_LABELS.status,
      ...overrides?.status,
    },
    table: {
      ...DEFAULT_TIMEZONE_LABELS.table,
      ...overrides?.table,
    } as Record<string, string>,
    toasts: {
      ...DEFAULT_TIMEZONE_LABELS.toasts,
      ...overrides?.toasts,
    },
  };
}
