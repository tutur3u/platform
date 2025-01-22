import { yearPlanSchema } from '@/app/api/ai/objects/types';
import { createAdminClient, createClient } from '@/utils/supabase/server';
import { vertex } from '@ai-sdk/google-vertex/edge';
import { streamObject } from 'ai';
import { NextResponse } from 'next/server';

interface PlanRequest {
  wsId: string;
  goals: string[];
  planDuration: number;
  skillLevel: string;
  availability: number;
  learningStyle?: string;
  preferredSchedule?: {
    weekdays?: boolean;
    weekends?: boolean;
    timeOfDay?: 'morning' | 'afternoon' | 'evening';
  };
  focusAreas?: string[];
  existingSkills?: string[];
  dependencies?: string[];
  milestoneFrequency?: 'weekly' | 'monthly' | 'quarterly';
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // Input validation
    if (!body || typeof body !== 'object') {
      return new Response('Invalid request body', { status: 400 });
    }

    const {
      // wsId,
      goals,
      planDuration,
      skillLevel,
      availability,
      learningStyle = 'balanced',
      preferredSchedule = {
        weekdays: true,
        weekends: false,
        timeOfDay: 'morning',
      },
      focusAreas = [],
      existingSkills = [],
      dependencies = [],
      milestoneFrequency = 'monthly',
    } = body as PlanRequest;

    // Validation
    // if (!wsId) {
    //   return new Response('Missing workspace ID', { status: 400 });
    // }
    // if (!goals?.length) {
    //   return new Response('At least one goal is required', { status: 400 });
    // }
    // if (!planDuration || planDuration < 1) {
    //   return new Response('Invalid plan duration', { status: 400 });
    // }
    // if (
    //   !skillLevel ||
    //   !['beginner', 'intermediate', 'advanced'].includes(skillLevel)
    // ) {
    //   return new Response('Invalid skill level', { status: 400 });
    // }
    // if (!availability || availability < 1) {
    //   return new Response('Invalid availability', { status: 400 });
    // }

    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!apiKey)
      return new Response('Service configuration error', { status: 500 });

    // Authorization
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.email) return new Response('Unauthorized', { status: 401 });

    const adminSb = await createAdminClient();

    const { data: whitelisted, error } = await adminSb
      .from('ai_whitelisted_emails')
      .select('enabled')
      .eq('email', user?.email)
      .maybeSingle();

    if (error || !whitelisted?.enabled)
      return new Response('Unauthorized', { status: 401 });

    // Format goals and additional context
    const formattedGoals = goals
      .map((goal, i) => `${i + 1}. ${goal}`)
      .join('\n');

    const schedulePreference = `
      - Available: ${availability} hours/week
      - Schedule: ${preferredSchedule?.weekdays ? 'Weekdays' : ''} ${preferredSchedule?.weekends ? 'Weekends' : ''}
      - Preferred time: ${preferredSchedule?.timeOfDay || 'morning'}
    `;

    const skillContext = `
      - Current level: ${skillLevel || 'beginner'}
      - Learning style: ${learningStyle || 'balanced'}
      - Existing skills: ${existingSkills?.join(', ') || 'none'}
      - Focus areas: ${focusAreas?.join(', ') || 'none'}
      ${dependencies?.length ? `- Dependencies: ${dependencies.join(', ')}` : ''}
    `;

    try {
      const result = await streamObject({
        model: vertex('gemini-1.5-flash', {
          safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
            {
              category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
              threshold: 'BLOCK_NONE',
            },
            {
              category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
              threshold: 'BLOCK_NONE',
            },
          ],
        }),
        maxTokens: 8192,
        prompt: `Create a detailed ${planDuration}-month learning and achievement plan.

GOALS:
${formattedGoals}

USER PROFILE:
${skillContext}

SCHEDULE PREFERENCES:
${schedulePreference}

PLANNING PREFERENCES:
- Plan duration: ${planDuration} months
- Milestone frequency: ${milestoneFrequency}

REQUIREMENTS:
1. Break down goals into achievable milestones and specific tasks
2. Consider user's skill level and learning style
3. Adapt task complexity progressively
4. Account for dependencies between tasks
5. Distribute tasks according to availability and schedule preferences
6. Include specific success metrics for each milestone
7. Provide actionable recommendations
8. Consider potential obstacles and mitigation strategies
9. Include stretch goals for faster progress
10. Add learning resources and practice exercises
11. Make sure the plan is realistic and achievable, with no duplicate tasks

Format the response in a clear, hierarchical structure with quarters, months, and weeks as appropriate.

Today's date: ${new Date().toISOString().split('T')[0]}`,
        schema: yearPlanSchema,
      });

      return result.toTextStreamResponse();
    } catch (error) {
      console.error('Error generating plan:', error);
      return new Response('Failed to generate plan', { status: 500 });
    }
  } catch (error: any) {
    console.error('Error in year plan API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
