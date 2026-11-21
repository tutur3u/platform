/**
 * Transitional, hand-written types for the held board-sprint schema.
 *
 * The board-sprint migrations are held, so the replay-generated
 * `@tuturuuu/types` omit the sprint columns on `task_cycles`,
 * `task_cycle_tasks` and `workspace_boards`, the `task_sprint_reports`
 * relation and the sprint RPCs. The sprint routes stay behind the
 * `BOARD_CYCLES_RELEASE_ENABLED` source barrier and type those surfaces
 * through this module instead. It changes types only; the client passed in is
 * returned unchanged.
 *
 * TODO(board-sprints): delete this module when the held sprint migrations are
 * admitted and `@tuturuuu/types` is regenerated from them. Admission creates
 * `task_sprint_reports` in `private`, read through `.schema('private')`; see
 * apps/docs/platform/features/task-board-sprints.mdx.
 */
import type {
  SupabaseClient,
  TypedSupabaseClient,
} from '@tuturuuu/supabase/types';
import type { Database, Json } from '@tuturuuu/types';

type PublicSchema = Database['public'];
type GeneratedTables = PublicSchema['Tables'];

type GenericTableShape = {
  Insert: object;
  Relationships: unknown[];
  Row: object;
  Update: object;
};

type WithHeldColumns<Table extends GenericTableShape, Columns> = Omit<
  Table,
  'Insert' | 'Row' | 'Update'
> & {
  Insert: Table['Insert'] & Partial<Columns>;
  Row: Table['Row'] & Columns;
  Update: Table['Update'] & Partial<Columns>;
};

type HeldTaskCycleColumns = {
  board_id: string | null;
  ended_at: string | null;
  goal: string | null;
  goal_result: string | null;
  sequence_number: number | null;
  started_at: string | null;
};

type HeldTaskCycleTaskColumns = {
  added_after_start: boolean;
  carry_count: number;
  end_decision: string | null;
};

type HeldWorkspaceBoardColumns = {
  sprint_length_weeks: number | null;
};

type HeldTaskSprintReportRow = {
  added_points: number;
  added_tasks: number;
  backlog_tasks: number;
  board_id: string;
  carried_in_tasks: number;
  carried_tasks: number;
  committed_points: number;
  cycle_id: string;
  done_points: number;
  done_tasks: number;
  ended_at: string;
  ended_by: string | null;
  goal: string | null;
  goal_result: string | null;
  next_cycle_id: string | null;
  people: Json;
  total_tasks: number;
  ws_id: string;
};

type HeldTaskCycleRow = GeneratedTables['task_cycles']['Row'] &
  HeldTaskCycleColumns;

type HeldSprintFunctions = {
  add_board_sprint: {
    Args: { p_actor_id?: string; p_board_id: string; p_ws_id: string };
    Returns: HeldTaskCycleRow;
  };
  end_board_sprint: {
    Args: {
      p_actor_id?: string;
      p_cycle_id: string;
      p_decisions?: Json;
      p_goal_result?: string;
    };
    Returns: HeldTaskSprintReportRow;
  };
  list_board_unplanned_task_ids: {
    Args: { p_board_id: string; p_ws_id: string };
    Returns: string[];
  };
  move_tasks_to_board_sprint: {
    Args: { p_board_id: string; p_cycle_id?: string; p_task_ids: string[] };
    Returns: number;
  };
  remove_board_sprint: {
    Args: {
      p_actor_id?: string;
      p_board_id: string;
      p_cycle_id: string;
      p_ws_id: string;
    };
    Returns: HeldTaskCycleRow;
  };
  set_board_sprint_length: {
    Args: { p_actor_id?: string; p_board_id: string; p_weeks: number };
    Returns: HeldTaskCycleRow;
  };
  start_board_sprint: {
    Args: { p_actor_id?: string; p_cycle_id: string };
    Returns: HeldTaskCycleRow;
  };
};

/** Only the relations and RPCs the held sprint routes touch. */
export type HeldBoardSprintDatabase = {
  public: {
    CompositeTypes: PublicSchema['CompositeTypes'];
    Enums: PublicSchema['Enums'];
    Functions: HeldSprintFunctions;
    Tables: {
      task_cycle_tasks: WithHeldColumns<
        GeneratedTables['task_cycle_tasks'],
        HeldTaskCycleTaskColumns
      >;
      task_cycles: WithHeldColumns<
        GeneratedTables['task_cycles'],
        HeldTaskCycleColumns
      >;
      task_sprint_reports: {
        Insert: Partial<HeldTaskSprintReportRow> &
          Pick<HeldTaskSprintReportRow, 'board_id' | 'cycle_id' | 'ws_id'>;
        Relationships: [];
        Row: HeldTaskSprintReportRow;
        Update: Partial<HeldTaskSprintReportRow>;
      };
      tasks: GeneratedTables['tasks'];
      workspace_boards: WithHeldColumns<
        GeneratedTables['workspace_boards'],
        HeldWorkspaceBoardColumns
      >;
    };
    Views: Record<never, never>;
  };
};

export type HeldBoardSprintClient = SupabaseClient<HeldBoardSprintDatabase>;

/** Retypes the admin client for held sprint queries; no runtime effect. */
export function heldBoardSprintClient(
  sbAdmin: TypedSupabaseClient
): HeldBoardSprintClient {
  return sbAdmin as unknown as HeldBoardSprintClient;
}
