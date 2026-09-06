import { type FunctionDeclaration, Type } from '@google/genai';

const timestamp = {
  type: Type.STRING,
  description:
    'ISO 8601 timestamp with explicit timezone offset. Resolve relative dates with get_current_time first.',
};
export const WORKSPACE_LIVE_TOOL_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: 'get_current_time',
    description:
      'Get current UTC time, local time, and the user browser timezone and UTC offset for scheduling.',
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: 'get_calendar_events',
    description:
      'Read events visible to this user in the current workspace for a positive date range of at most 31 days. Returns at most 50 events.',
    parameters: {
      type: Type.OBJECT,
      properties: { start_at: timestamp, end_at: timestamp },
      required: ['start_at', 'end_at'],
    },
  },
  {
    name: 'create_calendar_event',
    description:
      'Propose a first-party Tuturuuu calendar event. The user must approve the on-screen preview before creation. Never claim success before the tool returns success.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        title: {
          type: Type.STRING,
          description: 'Event title, at most 200 characters.',
        },
        start_at: timestamp,
        end_at: timestamp,
        description: { type: Type.STRING },
        location: { type: Type.STRING },
      },
      required: ['title', 'start_at', 'end_at'],
    },
  },
  {
    name: 'capture_session_note',
    description:
      'Capture a decision, plan, or concise recap in the session notes panel. Notes are temporary and retained only when the user exports the session. This does not save to the workspace.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        title: {
          type: Type.STRING,
          description: 'Short title, at most 200 characters.',
        },
        content: {
          type: Type.STRING,
          description: 'Note text, at most 5000 characters.',
        },
      },
      required: ['title', 'content'],
    },
  },
];
