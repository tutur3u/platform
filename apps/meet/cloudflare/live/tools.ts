import { type FunctionDeclaration, Type } from '@google/genai/web';
import type { LiveAudience } from '../../src/features/live-assistant/contracts';

export function liveTools(
  mode: LiveAudience,
  memoryEnabled: boolean
): FunctionDeclaration[] {
  const tools: FunctionDeclaration[] = [
    {
      name: 'meeting_context',
      description:
        'Get the current admitted participants and recent shared room chat. Use this for questions about who is here or what was just discussed in chat.',
      parameters: { type: Type.OBJECT, properties: {} },
    },
    {
      name: 'recall_conversation',
      description:
        'Search earlier turns in this assistant session. Follow nextCursor to search older pages.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          query: { type: Type.STRING },
          before: { type: Type.STRING },
        },
        required: ['query'],
      },
    },
    {
      name: 'organize_context',
      description:
        'Save a concise rolling summary, decisions, and open questions before context compression. Preserve unresolved commitments and distinguish participants. Does not create personal memories.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          summary: { type: Type.STRING },
          decisions: { type: Type.ARRAY, items: { type: Type.STRING } },
          openQuestions: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ['summary', 'decisions', 'openQuestions'],
      },
    },
    {
      name: 'current_time',
      description: 'Get the current date and time.',
      parameters: { type: Type.OBJECT, properties: {} },
    },
  ];
  if (mode === 'personal')
    tools.push({
      name: 'propose_room_reply',
      description:
        'Ask this user to approve exact text to share with everyone. This proposal is private; no room disclosure happens until approval.',
      parameters: {
        type: Type.OBJECT,
        properties: { text: { type: Type.STRING } },
        required: ['text'],
      },
    });
  if (mode === 'personal' && memoryEnabled)
    tools.push({
      name: 'remember',
      description:
        'Propose one useful, non-sensitive fact or preference about this user. Requires their explicit approval before saving.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          text: { type: Type.STRING },
          category: {
            type: Type.STRING,
            enum: ['preference', 'fact', 'project'],
          },
        },
        required: ['text', 'category'],
      },
    });
  return tools;
}
