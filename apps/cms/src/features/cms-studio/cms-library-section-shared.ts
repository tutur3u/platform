import type {
  ExternalProjectCollection,
  ExternalProjectEntry,
  ExternalProjectPublishEvent,
  ExternalProjectStudioAsset,
  WorkspaceExternalProjectBinding,
} from '@tuturuuu/types';
import type { CmsStrings } from './cms-strings';
import type { EditSection, WorkflowFilter } from './cms-studio-utils';

export type WorkflowLane = {
  entries: ExternalProjectEntry[];
  status: ExternalProjectEntry['status'];
  title: string;
};

export type PublishMutationPayload = {
  entryId?: string;
  eventKind: 'publish' | 'unpublish';
};

export type CmsLibraryCounts = {
  archived: number;
  collections: number;
  drafts: number;
  entries: number;
  published: number;
  scheduled: number;
};

export type CmsLibrarySectionProps = {
  activeCollection: ExternalProjectCollection | null;
  availableEditSections?: EditSection[];
  assets: ExternalProjectStudioAsset[];
  binding: WorkspaceExternalProjectBinding;
  collections: ExternalProjectCollection[];
  counts: CmsLibraryCounts;
  editSection: EditSection;
  entries: ExternalProjectEntry[];
  importPending: boolean;
  onChangeEditSection: (section: EditSection) => void;
  onCreateCollection: () => void;
  onCreateEntry: () => void;
  onDeleteCollection: (collectionId: string) => void;
  onDeleteEntry: (entryId: string) => void;
  onDuplicateEntry: (entryId: string) => void;
  onImport: () => void;
  onOpenCollection: (collectionId: string) => void;
  onOpenEntry: (entryId: string) => void;
  onOpenQuickTaxonomy: (entryId: string) => void;
  onPublishEntry: (payload: PublishMutationPayload) => void;
  onSearchChange: (value: string) => void;
  onSelectBulkEntry: (entryId: string, checked: boolean) => void;
  onSelectCollection: (collectionId: string) => void;
  onSetWorkflowFilter: (filter: WorkflowFilter) => void;
  onSetWorkflowScheduleValue: (value: string) => void;
  onWorkflowAction: (payload: {
    action:
      | 'archive'
      | 'publish'
      | 'restore-draft'
      | 'schedule'
      | 'set-status'
      | 'unpublish';
    scheduledFor?: string | null;
    status?: ExternalProjectEntry['status'];
  }) => void;
  publishEvents: ExternalProjectPublishEvent[];
  queryPending: boolean;
  quickTaxonomyPending: boolean;
  scheduleValue: string;
  search: string;
  selectedBulkIds: string[];
  selectedEntryId: string;
  strings: CmsStrings;
  taxonomyAvailable: boolean;
  workflowEntries: ExternalProjectEntry[];
  workflowFilter: WorkflowFilter;
  workflowLanes: WorkflowLane[];
};
