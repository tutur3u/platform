import 'server-only';

import type { MindAiPatchRecord, MindBoardSnapshot } from '@tuturuuu/types/db';
import { callMindRpc } from './repository-rpc';
import type { SaveMindGraphInput } from './schemas';

export async function saveMindGraph({
  boardId,
  input,
  wsId,
}: {
  boardId: string;
  input: SaveMindGraphInput;
  wsId: string;
}) {
  return callMindRpc<MindBoardSnapshot & { patches: MindAiPatchRecord[] }>(
    'mind_save_graph',
    {
      p_board_id: boardId,
      p_input: input,
      p_ws_id: wsId,
    }
  );
}
