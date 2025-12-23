import type { TimeTrackingCategory, Workspace } from '@tuturuuu/types';
import type { SessionWithRelations } from '../../types';

// Chain summary types
export interface ChainSession {
  id: string;
  title: string;
  description?: string;
  start_time: string;
  end_time: string;
  duration_seconds: number;
  chain_position: number;
}

export interface ChainBreak {
  id: string;
  session_id: string;
  break_type_name: string;
  break_start: string;
  break_end: string;
  break_duration_seconds: number;
  break_type_icon?: string;
  break_type_color?: string;
}

export interface ChainSummary {
  root_session_id: string;
  sessions: ChainSession[];
  breaks: ChainBreak[];
  total_work_seconds: number;
  total_break_seconds: number;
  original_start_time: string;
  chain_length: number;
}

// Shared props for both modes
export interface BaseMissedEntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: TimeTrackingCategory[] | null;
  wsId: string;
  workspace: Workspace;
}

// Props for normal missed entry mode
export interface NormalModeProps extends BaseMissedEntryDialogProps {
  mode?: 'normal';
  prefillStartTime?: string;
  prefillEndTime?: string;
  // Not used in normal mode
  session?: never;
  thresholdDays?: never;
  chainSummary?: never;
  onSessionDiscarded?: never;
  onMissedEntryCreated?: never;
}

// Props for exceeded threshold session mode
export interface ExceededSessionModeProps extends BaseMissedEntryDialogProps {
  mode: 'exceeded-session';
  session: SessionWithRelations;
  thresholdDays: number | null;
  onSessionDiscarded: () => void;
  // wasBreakPause indicates if the session was paused for a break (so paused state should be maintained)
  onMissedEntryCreated: (wasBreakPause?: boolean) => void;
  breakTypeId?: string; // Break type to create when submitting approval
  breakTypeName?: string; // Custom break type name
  // Not used in exceeded mode
  prefillStartTime?: never;
  prefillEndTime?: never;
  chainSummary?: never;
}

// Props for exceeded session chain mode
export interface ExceededSessionChainModeProps extends BaseMissedEntryDialogProps {
  mode: 'exceeded-session-chain';
  session: SessionWithRelations;
  thresholdDays: number | null;
  chainSummary: ChainSummary | null;
  onSessionDiscarded: () => void;
  // wasBreakPause indicates if the session was paused for a break (so paused state should be maintained)
  onMissedEntryCreated: (wasBreakPause?: boolean) => void;
  breakTypeId?: string; // Break type to create when submitting approval
  breakTypeName?: string; // Custom break type name
  // Not used in chain mode
  prefillStartTime?: never;
  prefillEndTime?: never;
}

export type MissedEntryDialogProps =
  | NormalModeProps
  | ExceededSessionModeProps
  | ExceededSessionChainModeProps;
