import { type FunctionDeclaration, Type } from '@google/genai';

const timestamp = {
  type: Type.STRING,
  description:
    'ISO 8601 timestamp with explicit timezone offset. Resolve relative dates with get_current_time first.',
};
export const WORKSPACE_LIVE_TOOL_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: 'set_theme',
    description: 'Immediately switch the application theme when asked.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        theme: { type: Type.STRING, enum: ['light', 'dark', 'system'] },
      },
      required: ['theme'],
    },
  },
  {
    name: 'set_sidebar',
    description:
      'Set navigation to expanded, collapsed, expand on hover, or hidden.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        behavior: {
          type: Type.STRING,
          enum: ['expanded', 'collapsed', 'hover', 'hidden'],
        },
      },
      required: ['behavior'],
    },
  },
  {
    name: 'show_workspace_artifact',
    description:
      'Open or tailor a useful product artifact beside chat. Supply a contextual title, explanation and filters. Omit layout to preserve the current arrangement. This does not read product data, create a meeting, or modify data. Use a title only unless a data-read tool returned the facts. Call each required UI action once and stop after success.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        kind: {
          type: Type.STRING,
          enum: ['tasks', 'calendar', 'finance', 'meetings'],
        },
        layout: {
          type: Type.STRING,
          enum: ['auto', 'horizontal', 'vertical', 'grid'],
        },
        presentation: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            description: { type: Type.STRING },
            highlights: {
              type: Type.ARRAY,
              maxItems: '3',
              items: { type: Type.STRING },
              description:
                'Up to three brief recommendations grounded in tool data.',
            },
            search: { type: Type.STRING },
            taskStatus: {
              type: Type.STRING,
              enum: ['all', 'overdue', 'today', 'upcoming'],
            },
            currency: { type: Type.STRING },
            date: {
              type: Type.STRING,
              description:
                'Local date YYYY-MM-DD; Calendar starts its week here.',
            },
            itemIds: {
              type: Type.ARRAY,
              maxItems: '50',
              items: { type: Type.STRING },
              description: 'Only IDs already returned by data tools.',
            },
          },
        },
      },
      required: ['kind'],
    },
  },
  {
    name: 'manage_workspace',
    description:
      'Close irrelevant artifacts, return to full chat, focus one panel, or arrange screen space. Use kind for close_artifact/focus_artifact; layout for set_layout. focus_artifact closes all other panels, so do not focus when asked to keep them. Replace a panel with close_artifact plus show_workspace_artifact. Do not repeat successful UI actions.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        operation: {
          type: Type.STRING,
          enum: ['close_artifact', 'close_all', 'focus_artifact', 'set_layout'],
        },
        kind: {
          type: Type.STRING,
          enum: ['tasks', 'calendar', 'finance', 'meetings'],
        },
        layout: {
          type: Type.STRING,
          enum: ['auto', 'horizontal', 'vertical', 'grid'],
        },
      },
      required: ['operation'],
    },
  },
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
