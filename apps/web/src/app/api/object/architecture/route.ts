import { google } from '@ai-sdk/google';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { streamObject } from 'ai';
import { NextResponse } from 'next/server';
import { z } from 'zod';

export const dynamic = 'force-dynamic';
export const runtime = 'edge';
export const maxDuration = 300;

const DEFAULT_MODEL_NAME = 'gemini-2.0-flash-001';

// Define architectureSchema inline to avoid import issues
const architectureSchema = z.object({
  buildingAnalysis: z.object({
    regulationSummary: z
      .string()
      .describe(
        'Summary of all relevant building regulations and codes for the specified location'
      ),
    permitRequirements: z
      .array(
        z.object({
          name: z.string().describe('Name of the permit or approval required'),
          description: z
            .string()
            .describe('Description of the permit requirements'),
          timeline: z
            .string()
            .describe('Estimated timeline to obtain this permit'),
          estimatedCost: z
            .string()
            .describe('Estimated cost to obtain this permit'),
          requiredDocuments: z
            .array(z.string())
            .describe('List of documents required for this permit'),
        })
      )
      .describe(
        'List of permits and approvals required for the building project'
      ),
    timeline: z
      .array(
        z.object({
          phase: z.string().describe('Name of the construction phase'),
          description: z
            .string()
            .describe('Description of activities during this phase'),
          startDate: z
            .string()
            .describe('Estimated start date (relative to project kickoff)'),
          duration: z.string().describe('Estimated duration of this phase'),
          dependencies: z
            .array(z.string())
            .optional()
            .describe(
              'Phases that must be completed before this one can start'
            ),
          keyMilestones: z
            .array(
              z.object({
                name: z.string().describe('Name of the milestone'),
                description: z
                  .string()
                  .describe('Description of the milestone'),
                estimatedDate: z
                  .string()
                  .describe('Estimated date to reach this milestone'),
              })
            )
            .describe('Key milestones within this phase'),
        })
      )
      .describe('Timeline of construction phases'),
    costEstimation: z
      .object({
        totalEstimate: z
          .string()
          .describe('Total estimated cost range for the entire project'),
        breakdown: z
          .array(
            z.object({
              category: z
                .string()
                .describe(
                  'Cost category (e.g., "Land acquisition", "Design", "Construction", "Permits")'
                ),
              estimate: z
                .string()
                .describe('Estimated cost range for this category'),
              notes: z
                .string()
                .describe(
                  'Any relevant notes or factors affecting this estimate'
                ),
            })
          )
          .describe('Breakdown of costs by category'),
        costFactors: z
          .array(z.string())
          .describe('Key factors affecting cost estimates'),
      })
      .describe('Cost estimation for the project'),
    environmentalConsiderations: z
      .array(
        z.object({
          aspect: z.string().describe('Environmental aspect to consider'),
          description: z
            .string()
            .describe('Description of this environmental consideration'),
          regulatoryRequirements: z
            .string()
            .describe('Regulatory requirements related to this aspect'),
          recommendedActions: z
            .array(z.string())
            .describe('Recommended actions to address this aspect'),
        })
      )
      .describe('Environmental considerations for the project'),
    recommendations: z
      .array(z.string())
      .describe('General recommendations for the project'),
    riskAssessment: z
      .array(
        z.object({
          risk: z.string().describe('Potential risk to the project'),
          impact: z
            .enum(['low', 'medium', 'high'])
            .describe('Potential impact of this risk'),
          likelihood: z
            .enum(['low', 'medium', 'high'])
            .describe('Likelihood of this risk occurring'),
          mitigationStrategies: z
            .array(z.string())
            .describe('Strategies to mitigate this risk'),
        })
      )
      .describe('Assessment of potential risks to the project'),
  }),
});

// This is a direct implementation of the AI architecture route
// instead of trying to import it from the package
export async function POST(req: Request) {
  try {
    console.log('[API:ARCHITECTURE] API route called, processing request');

    const sbAdmin = await createAdminClient();

    let requestBody;
    try {
      requestBody = await req.json();
      console.log('[API:ARCHITECTURE] Received request body:', requestBody);
    } catch (error) {
      console.error('[API:ARCHITECTURE] Error parsing request JSON:', error);
      return new Response('Invalid JSON in request body', { status: 400 });
    }

    const { wsId, location, buildingRequirements } = requestBody;

    if (!wsId) {
      console.error('[API:ARCHITECTURE] Missing workspace ID');
      return new Response('Missing workspace ID', { status: 400 });
    }
    if (!location) {
      console.error('[API:ARCHITECTURE] Missing location');
      return new Response('Missing location', { status: 400 });
    }
    if (!buildingRequirements) {
      console.error('[API:ARCHITECTURE] Missing building requirements');
      return new Response('Missing building requirements', { status: 400 });
    }

    // eslint-disable-next-line no-undef
    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!apiKey) {
      console.error('[API:ARCHITECTURE] Missing Google API key');
      return new Response(
        'Missing API key. Please set GOOGLE_GENERATIVE_AI_API_KEY in your environment.',
        { status: 400 }
      );
    }

    console.log('[API:ARCHITECTURE] Getting current user from Supabase');
    const supabase = await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) {
      console.error('[API:ARCHITECTURE] Error getting user:', userError);
      return new Response(`Error authenticating user: ${userError.message}`, {
        status: 401,
      });
    }

    if (!user) {
      console.error('[API:ARCHITECTURE] No user found');
      return new Response('Unauthorized - no user found', { status: 401 });
    }

    console.log('[API:ARCHITECTURE] Checking workspace secret permissions');
    const { count, error } = await sbAdmin
      .from('workspace_secrets')
      .select('*', { count: 'exact', head: true })
      .eq('ws_id', wsId)
      .eq('name', 'ENABLE_CHAT')
      .eq('value', 'true');

    if (error) {
      console.error(
        '[API:ARCHITECTURE] Error checking workspace secrets:',
        error
      );
      return new Response(`Error checking permissions: ${error.message}`, {
        status: 500,
      });
    }

    if (count === 0) {
      console.error(
        '[API:ARCHITECTURE] User does not have ENABLE_CHAT permission'
      );
      return new Response(
        'You are not allowed to use this feature. ENABLE_CHAT secret needs to be set to true.',
        {
          status: 401,
        }
      );
    }

    console.log(
      '[API:ARCHITECTURE] Starting AI generation for architecture analysis'
    );
    console.log('[API:ARCHITECTURE] Using model:', DEFAULT_MODEL_NAME);

    try {
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

      console.log(
        '[API:ARCHITECTURE] AI generation stream started successfully'
      );

      return result.toTextStreamResponse();
    } catch (aiError) {
      console.error('[API:ARCHITECTURE] Error during AI generation:', aiError);
      return new Response(
        `Error generating AI response: ${aiError instanceof Error ? aiError.message : String(aiError)}`,
        {
          status: 500,
        }
      );
    }
  } catch (error: any) {
    console.error('[API:ARCHITECTURE] Unhandled error in route:', error);
    return NextResponse.json(
      {
        message: `## Edge API Failure\nCould not complete the request. Please view the **Stack trace** below.\n\`\`\`bash\n${error?.stack}`,
      },
      {
        status: 500,
      }
    );
  }
}
