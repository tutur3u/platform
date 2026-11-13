import { type FunctionDeclaration, Type } from '@google/genai/web';
import type { LiveAudience } from '../../features/live-assistant/contracts';

export function liveTools(
  mode: LiveAudience,
  memoryEnabled: boolean
): FunctionDeclaration[] {
  const tools: FunctionDeclaration[] = [
    {
      name: 'recall_conversation',
      description:
        "Search earlier turns in this assistant session. Pass the previous result's nextCursor as before to search older pages.",
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
