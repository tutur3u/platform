import {
  FunctionCallingConfigMode,
  GoogleGenAI,
  Modality,
  Type,
} from '@google/genai';
import { createClient } from '@tuturuuu/supabase/next/server';
import { isValidTuturuuuEmail } from '@tuturuuu/utils/email/client';

export const maxDuration = 30;

// System instruction for the AI assistant
const SYSTEM_INSTRUCTION = `
TUTURUUU VOICE ASSISTANT SYSTEM PROMPT

You are Mira, the AI voice assistant for Tuturuuu—a unified productivity platform. You help users manage their tasks through natural voice conversation. Your responses should feel like talking to a helpful, capable colleague, not a robot reading data.

CORE PERSONALITY

- Conversational & Concise: You're speaking out loud, not writing a report. Keep responses brief and natural.
- Proactive & Intelligent: Anticipate what users need. Chain multiple tools together without asking for information you can look up yourself.
- Confident but Careful: Act decisively on safe operations. Only pause for confirmation on irreversible actions when genuinely ambiguous.

---
AVAILABLE TOOLS

- Google Search (built-in): Search the web for real-time information. Automatically handled when needed for current events, news, weather, sports, or fact-checking.
- get_my_tasks: Fetch user's tasks (overdue, today, upcoming). Use for any "show my tasks" request.
- search_tasks: Find tasks by keyword/description. Use when user references a task by name or when you need a task ID.
- create_task: Create a new task.
- update_task: Modify task (name, priority, status, description).
- delete_task: Move task to trash.
- get_task_details: Get full task info (labels, assignees, dates).
- get_workspace_members: Get list of all workspace members.
- get_tasks_by_assignee: Get tasks assigned to a specific person.

---

CRITICAL BEHAVIORAL RULES

1. RESPECT CONVERSATIONAL CONTEXT: Track what you've already told the user. Don't repeat information unless explicitly asked. Follow-up questions get incremental answers, not full recaps.

2. READ FROM TOOL RESPONSE: Always read from actual tool response data in the "result" field. Never make up or guess task names, counts, or details. Synthesize naturally when speaking.

3. AUTOMATIC TOOL CHAINING: When a user references a task by name/description, search for it yourself. Never ask for task IDs. If single match, proceed immediately. If multiple matches, clarify. If no match, suggest alternatives.

4. SMART CONFIRMATION: Don't confirm for fetching, searching, or reversible updates. Only confirm for ambiguous deletions or genuinely unclear requests.

5. VOICE-OPTIMIZED LANGUAGE: Use contractions, avoid jargon, keep sentences short, use natural transitions, round numbers, don't spell out ISO dates.

---

TOOL CHAINING WORKFLOWS

- Delete: search_tasks -> if 1 result: delete_task -> confirm. If 0: inform. If >1: clarify.
- Mark done: search_tasks -> if single: update_task(completed: true). If multiple: clarify.
- Show tasks: get_my_tasks -> visualize_task_list -> summarize conversationally.
- Task details: search_tasks -> get_task_details -> visualize_task_detail (ALWAYS pair these).
- Create: Extract info -> create_task -> confirm.
- Team members: get_workspace_members or visualize_workspace_members.
- Assignee tasks: get_tasks_by_assignee or visualize_assignee_tasks.

---

PRIORITY MAPPING

- "urgent", "ASAP", "critical" -> critical
- "important", "high priority", "soon" -> high
- "normal", "regular", default -> normal
- "low priority", "whenever", "no rush" -> low

---

VISUALIZATION TOOLS

- visualize_task_list: Visual card with task list
- visualize_timeline: Gantt-style timeline view
- visualize_status_breakdown: Status distribution chart
- visualize_task_detail: Detailed single task card
- visualize_workspace_members: Team members with avatars
- visualize_assignee_tasks: Tasks by assignee
- dismiss_visualization: Hide visualizations

VISUALIZATION RULES:
- Call visualize_* tools directly - they auto-fetch based on category if no taskIds provided.
- ALWAYS show visualizations for task-related questions, not just when user says "show".
- Be decisive: show visualizations immediately without asking for confirmation.
- Multiple can be shown at once.

---

CORE TOPIC HIGHLIGHTING (highlight_core_topic)

Use sparingly to emphasize the MOST IMPORTANT information: key decisions, critical facts, important warnings, or core answers. Keep title short (2-6 words), content essential (1-3 sentences). Choose emphasis: "info", "warning", "success", or "highlight" (default).
`;

// Task management tool declarations
const TASK_TOOL_DECLARATIONS = [
  {
    name: 'get_my_tasks',
    description:
      'Get all tasks assigned to or accessible by the current user. Returns tasks categorized by overdue, due today, and upcoming.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        category: {
          type: Type.STRING,
          description:
            'Optional filter: "overdue" for past-due tasks, "today" for tasks due today, "upcoming" for future tasks, or "all" (default) for all tasks.',
        },
      } as Record<string, { type: Type; description: string }>,
      required: [],
    },
  },
  {
    name: 'search_tasks',
    description:
      'Search for tasks by keywords or natural language. Returns matching tasks with similarity scores.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: {
          type: Type.STRING,
          description: 'The search query - keywords or natural language.',
        },
        matchCount: {
          type: Type.NUMBER,
          description: 'Maximum number of results to return. Default is 10.',
        },
      } as Record<string, { type: Type; description: string }>,
      required: ['query'],
    },
  },
  {
    name: 'create_task',
    description: 'Create a new task in the workspace.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        name: {
          type: Type.STRING,
          description: 'The name/title of the task.',
        },
        description: {
          type: Type.STRING,
          description: 'Optional detailed description of the task.',
        },
        priority: {
          type: Type.STRING,
          description: 'Task priority: "low", "normal", "high", or "critical".',
        },
      } as Record<string, { type: Type; description: string }>,
      required: ['name'],
    },
  },
  {
    name: 'update_task',
    description:
      'Update an existing task - name, description, priority, or mark as completed.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        taskId: {
          type: Type.STRING,
          description: 'The unique ID of the task to update.',
        },
        name: {
          type: Type.STRING,
          description: 'New name for the task.',
        },
        description: {
          type: Type.STRING,
          description: 'New description for the task.',
        },
        priority: {
          type: Type.STRING,
          description: 'New priority: "low", "normal", "high", or "critical".',
        },
        completed: {
          type: Type.BOOLEAN,
          description: 'Set to true to mark task as completed.',
        },
      } as Record<string, { type: Type; description: string }>,
      required: ['taskId'],
    },
  },
  {
    name: 'delete_task',
    description: 'Delete (move to trash) an existing task.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        taskId: {
          type: Type.STRING,
          description: 'The unique ID of the task to delete.',
        },
      } as Record<string, { type: Type; description: string }>,
      required: ['taskId'],
    },
  },
  {
    name: 'get_task_details',
    description:
      'Get detailed information about a specific task including labels and assignees.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        taskId: {
          type: Type.STRING,
          description: 'The unique ID of the task.',
        },
      } as Record<string, { type: Type; description: string }>,
      required: ['taskId'],
    },
  },
  {
    name: 'get_workspace_members',
    description:
      'Get all members of the current workspace. Returns list of members with names and IDs. Use this when user asks who is in the workspace, who are the team members, or before showing tasks by person.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        includeInvited: {
          type: Type.BOOLEAN,
          description: 'Include pending invitations (default: false)',
        },
      } as Record<string, { type: Type; description: string }>,
      required: [],
    },
  },
  {
    name: 'get_tasks_by_assignee',
    description:
      "Get all tasks assigned to a specific workspace member. Search by user ID or name. Use when user asks about someone's tasks, workload, or assignments.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        userId: {
          type: Type.STRING,
          description: 'The user ID of the assignee',
        },
        userName: {
          type: Type.STRING,
          description:
            'The display name to search for (partial match supported)',
        },
        listStatuses: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description:
            'Filter by task list status: "not_started", "active", "done", "closed". Default: ["not_started", "active"]',
        },
        includeCompleted: {
          type: Type.BOOLEAN,
          description:
            'Include tasks with completed_at timestamp set (default: false)',
        },
      } as Record<
        string,
        { type: Type; description: string; items?: { type: Type } }
      >,
      required: [],
    },
  },
];

// Visualization tool declarations
const VISUALIZATION_TOOL_DECLARATIONS = [
  {
    name: 'visualize_task_list',
    description:
      'Display a visual list of tasks on screen with their details. Use when user wants to SEE their tasks. Shows task names, priorities, due dates, and assignees in a card format. If no taskIds provided, automatically fetches tasks based on category.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        title: {
          type: Type.STRING,
          description:
            'Title for the visualization card (e.g., "Overdue Tasks", "Today\'s Tasks", "Search Results")',
        },
        taskIds: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description:
            'Optional: Array of task IDs to display. If not provided, tasks are fetched automatically based on category.',
        },
        category: {
          type: Type.STRING,
          description:
            'Category to filter by: "overdue", "today", "upcoming", or "search_results". Used to auto-fetch tasks if no taskIds provided.',
        },
      } as Record<
        string,
        { type: Type; description: string; items?: { type: Type } }
      >,
      required: ['title'],
    },
  },
  {
    name: 'visualize_timeline',
    description:
      'Display a Gantt-style timeline view of tasks on screen. Use when user asks to see their schedule or timeline. If no taskIds provided, automatically fetches tasks with dates.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        title: {
          type: Type.STRING,
          description: 'Title for the timeline view',
        },
        taskIds: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description:
            'Optional: Array of task IDs. If not provided, tasks with dates are fetched automatically.',
        },
        timeRange: {
          type: Type.STRING,
          description: 'Time range: "week", "month", or "all"',
        },
      } as Record<
        string,
        { type: Type; description: string; items?: { type: Type } }
      >,
      required: ['title'],
    },
  },
  {
    name: 'visualize_status_breakdown',
    description:
      'Display a status distribution chart showing task counts by status on screen. Use when user asks about task distribution, status breakdown, or progress overview.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        title: {
          type: Type.STRING,
          description: 'Title for the chart',
        },
      } as Record<string, { type: Type; description: string }>,
      required: ['title'],
    },
  },
  {
    name: 'visualize_task_detail',
    description:
      'Display a detailed card for a single task with all its information on screen. Use when user wants to see full details of a specific task.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        taskId: {
          type: Type.STRING,
          description: 'The ID of the task to display',
        },
      } as Record<string, { type: Type; description: string }>,
      required: ['taskId'],
    },
  },
  {
    name: 'dismiss_visualization',
    description:
      'Hide/dismiss currently displayed visualizations. Use when user says to close, hide, or dismiss a visualization.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        visualizationId: {
          type: Type.STRING,
          description:
            'ID of the visualization to dismiss. Use "all" to dismiss all visualizations.',
        },
      } as Record<string, { type: Type; description: string }>,
      required: ['visualizationId'],
    },
  },
  {
    name: 'highlight_core_topic',
    description:
      'Display a prominent card in the CENTER of the screen highlighting the core matter or key information being discussed. Use this to emphasize critical points, important decisions, key facts, or the main topic. Only one can be shown at a time - calling this replaces any previous core highlight.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        title: {
          type: Type.STRING,
          description:
            'Short, impactful headline for the core topic (2-6 words)',
        },
        content: {
          type: Type.STRING,
          description:
            'The key information or core matter to highlight (1-3 sentences)',
        },
        emphasis: {
          type: Type.STRING,
          description:
            'Visual style: "info" (blue), "warning" (orange), "success" (green), or "highlight" (purple, default)',
        },
      } as Record<string, { type: Type; description: string }>,
      required: ['title', 'content'],
    },
  },
  {
    name: 'dismiss_core_mention',
    description:
      'Dismiss/hide the currently displayed core topic highlight from the center of the screen. Use when the user is done with the highlighted information or wants to clear it.',
    parameters: {
      type: Type.OBJECT,
      properties: {} as Record<string, never>,
      required: [],
    },
  },
  {
    name: 'visualize_workspace_members',
    description:
      'Display workspace members as a visual card on screen. Shows team member names and avatars. Use when user asks "who is on the team?", "show team members", or wants to see workspace members.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        title: {
          type: Type.STRING,
          description: 'Title for the card (e.g., "Team Members")',
        },
        includeInvited: {
          type: Type.BOOLEAN,
          description: 'Include pending invitations (default: false)',
        },
      } as Record<string, { type: Type; description: string }>,
      required: ['title'],
    },
  },
  {
    name: 'visualize_assignee_tasks',
    description:
      "Display tasks assigned to a specific person as a visual card on screen. Use when user asks to show [name]'s tasks or wants to see what someone is working on.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        title: {
          type: Type.STRING,
          description: 'Title for the card (e.g., "[Name]\'s Tasks")',
        },
        userId: {
          type: Type.STRING,
          description: 'The user ID of the assignee',
        },
        userName: {
          type: Type.STRING,
          description: 'The display name to search for',
        },
        listStatuses: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description:
            'Filter by task list status: "not_started", "active", "done", "closed". Default: ["not_started", "active"]',
        },
        includeCompleted: {
          type: Type.BOOLEAN,
          description:
            'Include tasks with completed_at timestamp set (default: false)',
        },
      } as Record<
        string,
        { type: Type; description: string; items?: { type: Type } }
      >,
      required: ['title'],
    },
  },
];

// Combined tool declarations
const ALL_TOOL_DECLARATIONS = [
  ...TASK_TOOL_DECLARATIONS,
  ...VISUALIZATION_TOOL_DECLARATIONS,
];

export async function POST() {
  try {
    // 1. Authenticate user
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Validate Tuturuuu email
    if (!isValidTuturuuuEmail(user.email)) {
      return Response.json(
        { error: 'Only Tuturuuu emails are allowed' },
        { status: 403 }
      );
    }

    // 3. Generate ephemeral token with model constraints
    // Use v1alpha API version for native audio features
    const client = new GoogleGenAI({
      apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
      httpOptions: { apiVersion: 'v1alpha' },
    });
    const expireTime = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 mins

    const tokenConfig = {
      config: {
        // Allow multiple session attempts (useful for reconnects and development)
        uses: 100,
        expireTime,
        // Allow session to start anytime within the token's validity window
        newSessionExpireTime: expireTime,
        liveConnectConstraints: {
          // Use gemini-2.0-flash-live for multimodal support (audio + video + function calling)
          // Note: gemini-2.5-flash-native-audio-preview is audio-only and may not support all features
          model: 'gemini-2.5-flash-native-audio-preview-09-2025',
          config: {
            responseModalities: [Modality.AUDIO],
            proactivity: { proactiveAudio: true },
            // Enable context window compression for longer sessions (unlimited duration)
            contextWindowCompression: { slidingWindow: {} },
            // Enable session resumption to receive session handles for reconnection
            sessionResumption: {},
            thinkingConfig: {
              thinkingBudget: 0,
            },
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: 'Aoede',
                },
              },
            },
            // System instruction so the AI knows its role
            systemInstruction: {
              parts: [{ text: SYSTEM_INSTRUCTION }],
            },
            // Tools configuration - this is CRITICAL for function calling
            // MUST be inside config object to be embedded in the token
            // Google Search is added as a built-in tool for real-time information
            tools: [
              { functionDeclarations: ALL_TOOL_DECLARATIONS },
              { googleSearch: {} },
            ],
            toolConfig: {
              functionCallingConfig: {
                mode: FunctionCallingConfigMode.AUTO,
              },
            },
          },
        },
      },
    };

    console.log('[Token] Creating token with configuration:', {
      model: tokenConfig.config.liveConnectConstraints.model,
      functionDeclarationCount: ALL_TOOL_DECLARATIONS.length,
      functionNames: ALL_TOOL_DECLARATIONS.map((t) => t.name),
      builtInTools: ['googleSearch'],
      mode: FunctionCallingConfigMode.AUTO,
      hasSystemInstruction:
        !!tokenConfig.config.liveConnectConstraints.config.systemInstruction,
      contextWindowCompression: 'slidingWindow (enabled)',
      sessionResumption: 'enabled',
    });

    const token = await client.authTokens.create(tokenConfig);

    console.log('[Token] Token created successfully:', {
      tokenName: token.name,
      note: 'If Gemini does not call functions, the native audio model may not support function calling.',
    });

    return Response.json({ token: token.name });
  } catch (error) {
    console.error('Error generating ephemeral token:', error);
    return Response.json(
      { error: 'Failed to generate token' },
      { status: 500 }
    );
  }
}
