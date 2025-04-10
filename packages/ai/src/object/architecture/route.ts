import { architectureSchema } from '../types';
import { google } from '@ai-sdk/google';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { streamObject } from 'ai';
import { NextResponse } from 'next/server';

export const runtime = 'edge';
export const maxDuration = 120; // Increased duration for complex analysis
export const preferredRegion = 'sin1';

const DEFAULT_MODEL_NAME = 'gemini-2.0-flash-001';

export async function POST(req: Request) {
  const sbAdmin = await createAdminClient();

  const { wsId, location, buildingRequirements } = (await req.json()) as {
    wsId?: string;
    location?: string;
    buildingRequirements?: string;
  };

  try {
    if (!wsId) return new Response('Missing workspace ID', { status: 400 });
    if (!location) return new Response('Missing location', { status: 400 });
    if (!buildingRequirements)
      return new Response('Missing building requirements', { status: 400 });

    // eslint-disable-next-line no-undef
    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!apiKey) return new Response('Missing API key', { status: 400 });

    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return new Response('Unauthorized', { status: 401 });

    const { count, error } = await sbAdmin
      .from('workspace_secrets')
      .select('*', { count: 'exact', head: true })
      .eq('ws_id', wsId)
      .eq('name', 'ENABLE_CHAT')
      .eq('value', 'true');

    if (error) return new Response(error.message, { status: 500 });
    if (count === 0)
      return new Response('You are not allowed to use this feature.', {
        status: 401,
      });

    const result = streamObject({
      model: google(DEFAULT_MODEL_NAME, {
        safetySettings: [
          {
            category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
            threshold: 'BLOCK_NONE',
          },
          {
            category: 'HARM_CATEGORY_HATE_SPEECH',
            threshold: 'BLOCK_NONE',
          },
          {
            category: 'HARM_CATEGORY_HARASSMENT',
            threshold: 'BLOCK_NONE',
          },
          {
            category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
            threshold: 'BLOCK_NONE',
          },
        ],
      }),
      prompt: `Analyze building regulations and requirements for a construction project in ${location} with the following requirements: ${buildingRequirements}.
        
        Provide a comprehensive analysis including:
        1. Summary of relevant building codes and regulations
        2. Permit requirements and documentation needed
        3. Timeline for each phase of construction
        4. Cost estimation (breakdown by category)
        5. Environmental considerations
        6. General recommendations
        7. Risk assessment
        
        Be specific about the regulations in ${location} and provide realistic estimates for timelines and costs.`,
      schema: architectureSchema,
    });

    return result.toTextStreamResponse();
  } catch (error: any) {
    console.log(error);
    return NextResponse.json(
      {
        message: `## Edge API Failure\nCould not complete the request. Please view the **Stack trace** below.\n\`\`\`bash\n${error?.stack}`,
      },
      {
        status: 200,
      }
    );
  }
}
