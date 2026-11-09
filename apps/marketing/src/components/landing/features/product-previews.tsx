import {
  CrmPreview,
  FinancePreview,
  InventoryPreview,
  NovaPreview,
} from './previews/business-previews';
import {
  CalendarPreview,
  MeetPreview,
  TasksPreview,
  TrackPreview,
} from './previews/time-previews';
import {
  ChatPreview,
  DocumentsPreview,
  DrivePreview,
  WorkflowsPreview,
} from './previews/work-previews';

export {
  CrmPreview,
  FinancePreview,
  InventoryPreview,
  NovaPreview,
} from './previews/business-previews';
export { PreviewFrame, PreviewHeader } from './previews/frame';
export {
  CalendarPreview,
  MeetPreview,
  TasksPreview,
  TrackPreview,
} from './previews/time-previews';
export {
  ChatPreview,
  DocumentsPreview,
  DrivePreview,
  WorkflowsPreview,
} from './previews/work-previews';

/**
 * Registry keyed by the same product slugs the navigation uses, so a card in
 * the bento, a tile in the suite list and a `/products/*` page all refer to an
 * app by one name.
 */
export const productPreviews = {
  calendar: CalendarPreview,
  tasks: TasksPreview,
  meet: MeetPreview,
  chat: ChatPreview,
  finance: FinancePreview,
  nova: NovaPreview,
  workflows: WorkflowsPreview,
  documents: DocumentsPreview,
  drive: DrivePreview,
  track: TrackPreview,
  crm: CrmPreview,
  inventory: InventoryPreview,
} as const;
