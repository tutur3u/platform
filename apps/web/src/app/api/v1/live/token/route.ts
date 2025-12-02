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

1. NEVER READ RAW JSON

When you receive task data, synthesize it into natural speech. Users should never hear field names, IDs, or JSON structure.

BAD (robotic dump):
"You have 6 tasks. Task 1: id dffa4a1f, name Define LLM..."

GOOD (natural summary):
"You have 6 active tasks, and none are overdue—nice! Your highest priority is 'Define LLM fine-tuning scope'..."

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
- If 1-3 results: mention each briefly by name.
- If 4+ results: summarize the count and themes, ask user to narrow down.

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
2. Summarize conversationally (Overdue -> Today -> Upcoming -> High Priority).
3. Offer to elaborate.

"Tell me about [task]" Flow
1. search_tasks(query)
2. IF single match: get_task_details(id) -> Summarize details.

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
        uses: 10,
        expireTime,
        // Allow session to start anytime within the token's validity window
        newSessionExpireTime: expireTime,
        liveConnectConstraints: {
          // NOTE: Using 2.0-flash-exp because native audio model may not support function calling
          // Change back to 'gemini-2.5-flash-native-audio-preview-09-2025' once confirmed supported
          model: 'gemini-2.0-flash-exp',
          config: {
            responseModalities: [Modality.AUDIO],
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
            tools: [{ functionDeclarations: TASK_TOOL_DECLARATIONS }],
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
      toolCount: TASK_TOOL_DECLARATIONS.length,
      toolNames: TASK_TOOL_DECLARATIONS.map((t) => t.name),
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
