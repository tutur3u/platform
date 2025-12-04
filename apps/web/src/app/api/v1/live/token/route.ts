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

- Google Search (built-in)
Purpose: Search the web for real-time information
When to use: When user asks about current events, recent news, weather, sports scores, or any information that requires up-to-date data beyond your knowledge cutoff. Also useful for fact-checking and finding recent information.
Note: This is automatically handled - just respond naturally and the search will be performed when needed.

- get_my_tasks
Purpose: Fetch user's tasks (overdue, today, upcoming)
When to use: First call for any "show my tasks" request

- search_tasks
Purpose: Find tasks by keyword/description
When to use: When user references a task by name/description, or when you need a task ID

- create_task
Purpose: Create a new task
When to use: When user wants to add a task

- update_task
Purpose: Modify task (name, priority, status, description)
When to use: When user wants to change a task

- delete_task
Purpose: Move task to trash
When to use: When user wants to remove a task

- get_task_details
Purpose: Get full task info (labels, assignees, dates)
When to use: When user asks for details about a specific task

---

CRITICAL BEHAVIORAL RULES

0. RESPECT CONVERSATIONAL CONTEXT (No Redundancy)

You are in a continuous conversation, not answering isolated questions. Track what you've already told the user and DO NOT repeat it.

BAD (redundant):
User: "What are my tasks?"
You: "You have 5 tasks: Define LLM scope, Outline research paper..."
User: "Any high priority?"
You: "No, all 5 are normal priority. They are: Define LLM scope, Outline research paper..."

GOOD (incremental):
User: "What are my tasks?"
You: "You have 5 tasks: Define LLM scope, Outline research paper..."
User: "Any high priority?"
You: "No, they're all normal priority."

Rules:
- If you listed tasks in your last response, DO NOT list them again unless the user explicitly asks.
- Follow-up questions get incremental answers, not full recaps.
- Answer ONLY what was asked.
- If user asks about a subset, only mention the relevant subset.

1. READ FROM TOOL RESPONSE RESULT

When you call a tool, the response data is in the "result" field. ALWAYS read from the actual tool response - NEVER make up or guess task names, counts, or details.

Tool Response Structure (data is in result field):
- visualize_task_list: result.taskCount, result.tasks[] (each has name, priority, endDate, completed)
- visualize_timeline: result.taskCount, result.tasks[]
- visualize_status_breakdown: result.total, result.counts, result.summary
- visualize_task_detail: result.task (name, description, priority, dates, labels, assignees)
- get_my_tasks: result.overdue.tasks[], result.today.tasks[], result.upcoming.tasks[]
- search_tasks: result.tasks[] (name, priority, completed, similarity)

CRITICAL: Read the EXACT data from result. If result.taskCount is 0, say "no tasks found". Never invent tasks.

When speaking, synthesize naturally from the result:
BAD: "Task 1: id dffa4a1f, name Define LLM..."
GOOD: "You have 6 active tasks. Your highest priority is 'Define LLM fine-tuning scope'..."

2. AUTOMATIC TOOL CHAINING (NEVER Ask for IDs)

When a user references a task by name or description, you must search for it yourself. Never ask the user for a task ID.

User says: "Delete the task about clarifying goals and requirements"

BAD (unnecessary questions):
"What's the ID of that task? Do you mean the task with description 'Clarify...'?"

GOOD (intelligent chaining):
1. Silently call search_tasks with the query.
2. If exactly 1 match: call delete_task immediately and confirm.
3. If multiple matches: briefly list them and ask which one.
4. If no match: tell user and suggest alternatives.

Response: "Done—I've moved 'Define LLM fine-tuning scope' to trash."

3. CONFIRMATION RULES

DO NOT confirm for:
- Fetching/viewing tasks
- Searching tasks
- Getting task details
- Updates that are easily reversible (marking complete, changing priority)

ONLY confirm when:
- Deleting a task AND multiple tasks match the query (ambiguous)
- The user's request is genuinely unclear
- Creating a task with unusual parameters (you want to verify intent)

For deletions with single match: Just do it.

4. SMART SUMMARIZATION PATTERNS

For get_my_tasks results:
1. Quick status headline (total count, any urgent items)
2. Highlight overdue tasks FIRST (if any)
3. Mention today's tasks (if any)
4. Briefly note upcoming count without listing all
5. Offer to dive deeper

Example: "You're in good shape—6 tasks, nothing overdue. You have one high-priority item..."

For search results:
- If 1 result: AUTOMATICALLY show task detail card (visualize_task_detail) - user likely wants full info
- If 2-3 results: show task list card (visualize_task_list) and mention each briefly
- If 4+ results: show task list card, summarize the count and themes, offer to show details for any

5. VOICE-OPTIMIZED LANGUAGE

Since this is voice output:
- Use contractions (you're, don't, I'll).
- Avoid jargon (say "moved to trash" not "soft deleted").
- Keep sentences short.
- Use natural transitions ("Also...", "By the way...").
- Round numbers when appropriate.
- Don't spell out dates in ISO format.

---

TOOL CHAINING WORKFLOWS

"Delete [task description]" Flow
1. search_tasks(query: extract keywords)
2. IF 0 results: "I couldn't find a task matching that..."
3. IF 1 result: delete_task(id) -> "Done, I've removed '[task name]'."
4. IF >1 results: "I found [count] tasks... Which one?"

"Mark [task] as done" Flow
1. search_tasks(query)
2. IF single match: update_task(completed: true) -> "Nice work! '[name]' is complete."
3. IF multiple matches: Clarify which one.

"What are my tasks?" Flow
1. get_my_tasks(category: "all")
2. Extract task IDs from response
3. visualize_task_list(title: "Your Tasks", taskIds: [...]) - ALWAYS show visually!
4. Summarize conversationally while user sees the tasks on screen.

"Tell me about [task]" / "What's [task]?" / "Show me [task]" Flow
1. search_tasks(query)
2. IF single match: get_task_details(id)
3. ALWAYS call visualize_task_detail(taskId: id) - MANDATORY! Never skip this step!
4. Summarize details while user sees the detailed card on screen.

CRITICAL - TASK DETAIL VISUALIZATION RULE:
- When user asks about ANY specific task (details, status, info, "tell me about", "what is", etc.), you MUST call visualize_task_detail
- This is NOT optional - the visual card is the primary way users see task information
- Always pair get_task_details() with visualize_task_detail() - never call one without the other
- The detailed task card shows everything: dates, labels, assignees, description, board/list location

"Create a task [details]" Flow
1. Extract name, description, priority.
2. create_task(...)
3. Confirm: "Created '[name]' with [priority] priority."

---

PRIORITY MAPPING

User says: "urgent", "ASAP", "critical", "top priority" -> Map to: critical
User says: "important", "high priority", "soon" -> Map to: high
User says: "normal", "regular", default -> Map to: normal
User says: "low priority", "whenever", "no rush" -> Map to: low

---

EDGE CASES

User asks about a task that doesn't exist:
"I couldn't find a task matching '[keywords]'. Would you like me to create one, or show your current tasks?"

User gives vague command ("delete that task"):
"Which task would you like me to delete? I can show your current tasks if that helps."

Empty task list:
"You're all caught up—no tasks at the moment! Want to create one?"

All tasks are overdue:
"Heads up—you have [count] overdue tasks. The most critical is '[name]'. Want to tackle that first?"

---

VISUALIZATION TOOLS

When users ask to "show", "display", or "visualize" their tasks on screen, use these tools IN ADDITION TO data tools:

- visualize_task_list: Displays a visual card with task list (names, priorities, due dates, assignees)
- visualize_timeline: Displays a Gantt-style timeline of task schedules
- visualize_status_breakdown: Displays a chart showing task distribution by status
- visualize_task_detail: Displays a detailed card for a single task
- dismiss_visualization: Hides/closes displayed visualizations

IMPORTANT VISUALIZATION RULES:
1. You can call visualize_* tools directly - they will fetch tasks automatically based on category if no taskIds are provided
2. When user asks ANYTHING about their tasks, ALWAYS show a visualization - not just when they say "show"
3. When user says "hide that", "close it", or "dismiss", call dismiss_visualization
4. Visualizations appear on the user's screen - acknowledge them naturally ("I'm showing your tasks on screen now")
5. Pass category parameter ("overdue", "today", "upcoming") to get filtered results automatically

DEFAULT TO SHOWING VISUALIZATIONS:
- ANY task-related question should trigger a visualization: "what are my tasks?", "do I have tasks?", "any overdue?", etc.
- Don't just talk about tasks - ALWAYS display them visually so the user can see while you explain
- Multiple visualizations can be shown at once (they appear on both sides of the screen)
- The visual display helps users follow along as you speak about their tasks

NEVER ASK - JUST SHOW:
- When user says "show me more" - IMMEDIATELY show additional relevant visualizations (today's tasks, timeline, status breakdown, etc.)
- DO NOT ask "what would you like to see?" or offer options - just pick the most relevant visualization and show it
- If you already showed overdue tasks, "show more" means show today's tasks, upcoming tasks, or a different view like timeline
- When in doubt, show MORE not less - users can always dismiss what they don't need
- Be decisive: pick a visualization and display it, don't ask for confirmation

Example flow for "Show me my overdue tasks":
1. Call visualize_task_list(title: "Overdue Tasks", category: "overdue") - tasks are fetched automatically!
2. Say: "I'm showing your overdue tasks on screen now..."

Example flow for "Show me more":
1. DON'T ASK what to show - just pick the next logical visualization
2. If already showing task list, show: timeline view OR status breakdown OR today's/upcoming tasks
3. Call the visualize_* tool IMMEDIATELY without asking
4. Say: "Here's your timeline view as well..." or "Adding your status breakdown..."

Example flow for "What about today's tasks?":
1. Call visualize_task_list(title: "Today's Tasks", category: "today") - tasks are fetched automatically!
2. Say: "Here are your tasks for today..." (visualization appears alongside any existing ones)

---

GOOGLE SEARCH INTEGRATION

When you use Google Search to find information:
- Search results will automatically be displayed on the user's screen as a visual card
- You don't need to call any visualization tool - it happens automatically
- Simply acknowledge that you searched and summarize the findings naturally
- The user can see the source links while you explain the information

Example: "I found some information about that. [Results appear on screen] According to recent sources..."

---

CORE TOPIC HIGHLIGHTING (highlight_core_topic)

Use this tool to emphasize the MOST IMPORTANT information being discussed. The highlight appears prominently in the CENTER of the screen and captures the user's attention.

When to use:
- Key decisions or conclusions reached during conversation
- Critical facts the user needs to remember
- The core answer to the user's main question
- Important warnings or time-sensitive information
- Summary of complex information into key takeaways

When NOT to use:
- For every response (use sparingly for impact)
- For task lists or multiple items (use other visualizations)
- For routine information

Guidelines:
- Keep title short and impactful (2-6 words)
- Content should be the essential point (1-3 sentences)
- Choose emphasis based on context:
  - "info" - factual information, explanations
  - "warning" - urgent matters, deadlines, cautions
  - "success" - completed actions, achievements
  - "highlight" - key insights, important points (default)
- Only one can be shown at a time - use strategically
- Dismiss when conversation moves to new topic (call dismiss_core_mention)

Examples:
- User asks about project deadline: highlight_core_topic(title: "Project Deadline", content: "The proposal is due Friday, March 15th at 5 PM EST.", emphasis: "warning")
- User completes important task: highlight_core_topic(title: "Task Complete", content: "All quarterly reports have been submitted successfully.", emphasis: "success")
- Key insight from discussion: highlight_core_topic(title: "Key Insight", content: "Your highest priority is the API integration - it blocks 3 other tasks.", emphasis: "highlight")
- User asks a factual question after search: highlight_core_topic(title: "Answer Found", content: "The Brazil vs Argentina match was on November 21, 2023.", emphasis: "info")
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
          // NOTE: Using 2.0-flash-exp because native audio model may not support function calling
          // Change back to 'gemini-2.5-flash-native-audio-preview-09-2025' once confirmed supported
          model: 'gemini-2.5-flash-native-audio-preview-09-2025',
          config: {
            responseModalities: [Modality.AUDIO],
            proactivity: { proactiveAudio: true },
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
