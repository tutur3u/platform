import type { Json } from '@tuturuuu/types/db';

export type HiveVector = { x: number; y: number; z: number };

export type HiveWorld = {
  blocks: Array<{
    id: string;
    position: HiveVector;
    state?: Record<string, Json | undefined>;
    type: string;
  }>;
  objects: Array<{
    id: string;
    position: HiveVector;
    rotation?: number;
    state?: Record<string, Json | undefined>;
    type: string;
  }>;
};

export type HiveServerRow = {
  created_at: string;
  description: string | null;
  enabled: boolean;
  id: string;
  max_players: number;
  name: string;
  slug: string;
  total_currency: string | number;
  settings: Json;
  ollama_state: Json;
};

export type HiveWorldStateRow = {
  crdt_state: Buffer | Uint8Array | null;
  crdt_state_vector: Buffer | Uint8Array | null;
  op_seq: string | number;
  revision: string | number;
  world_data: Json;
};

export type HiveWorldEventRow = {
  actor_user_id: string | null;
  created_at: string;
  event_type: string;
  id: string;
  payload: Json;
  op_seq: string | number;
  revision: string | number;
  server_id: string;
  world_data?: Json | null;
};

export type HiveNpcRow = {
  backstory: string | null;
  backstory_enabled: boolean | null;
  created_at?: string;
  custom_prompt_enabled: boolean | null;
  id: string;
  memory_enabled: boolean | null;
  model: string;
  name: string;
  position: Json;
  role: string;
  server_id: string;
  settings: Json;
  status?: string;
  system_prompt: string | null;
};

export type HiveNpcRunRow = {
  actor_user_id: string | null;
  autonomous: boolean | null;
  credit_source: string | null;
  credit_ws_id: string | null;
  credits_deducted: string | number | null;
  created_at: string;
  error: string | null;
  id: string;
  input_context: Json;
  input_tokens: number | null;
  interaction_id: string | null;
  llm_cost: string | number | null;
  llm_model: string | null;
  llm_provider: string | null;
  npc_id: string;
  npc_name?: string | null;
  output_decision: Json;
  output_tokens: number | null;
  prompt_mode: string;
  reasoning_tokens: number | null;
  status: string | null;
  target_npc_id: string | null;
  target_npc_name?: string | null;
  trigger: string | null;
};

export type HiveMemberRow = {
  created_at: string;
  enabled: boolean;
  id: string;
  notes: string | null;
  user_id: string;
};

export type HiveAccessRequestStatus = 'approved' | 'pending' | 'rejected';

export type HiveAccessRequestRow = {
  created_at: string;
  email: string | null;
  id: string;
  note: string | null;
  requested_at: string;
  resolution_note: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  status: HiveAccessRequestStatus;
  updated_at: string;
  user_id: string;
};
