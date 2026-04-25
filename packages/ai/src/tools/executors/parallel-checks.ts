import { google } from '@ai-sdk/google';
import { stepCountIs, ToolLoopAgent } from 'ai';
import { z } from 'zod';

const PARALLEL_CHECKS_MODEL = 'gemini-3.1-flash-lite-preview';

const ParallelChecksArgsSchema = z.object({
  question: z
    .string()
    .transform((value) => value.trim())
    .refine((value) => value.length > 0, {
      message: 'Missing required `question`.',
    })
    .transform((value) => value.slice(0, 2000)),
  context: z
    .string()
    .transform((value) => value.trim())
    .optional()
    .transform((value) => (value ? value.slice(0, 8000) : undefined)),
  checks: z
    .array(z.enum(['assumptions', 'factuality', 'risk', 'implementation']))
    .min(1)
    .max(4)
    .optional(),
});

type CheckKind = z.infer<typeof ParallelChecksArgsSchema>['checks'] extends
  | Array<infer T>
  | undefined
  ? T
  : never;

type ParallelCheckResult = {
  label: string;
  finding: string;
};

const CHECK_INSTRUCTIONS: Record<CheckKind, string> = {
  assumptions:
    'You identify hidden assumptions, missing premises, and unclear decision points. Return concise findings only.',
  factuality:
    'You check whether claims need verification, external evidence, or clearer source attribution. Return concise findings only.',
  implementation:
    'You review implementation feasibility, sequencing, interfaces, and likely integration risks. Return concise findings only.',
  risk: 'You review failure modes, user-impact risks, regressions, and test gaps. Return concise findings only.',
};

const DEFAULT_CHECKS: CheckKind[] = ['assumptions', 'factuality', 'risk'];

function buildPrompt({
  check,
  context,
  question,
}: {
  check: CheckKind;
  context?: string;
  question: string;
}) {
  return `Review this request from the "${check}" perspective.

Question or scenario:
${question}

${context ? `Relevant context:\n${context}\n\n` : ''}Return:
- 1 to 3 concise findings
- Any blocker, if present
- "No material issues" if this perspective has nothing important`;
}

async function runCheck({
  abortSignal,
  check,
  context,
  question,
}: {
  abortSignal?: AbortSignal;
  check: CheckKind;
  context?: string;
  question: string;
}): Promise<ParallelCheckResult> {
  const agent = new ToolLoopAgent({
    model: google(PARALLEL_CHECKS_MODEL),
    instructions: CHECK_INSTRUCTIONS[check],
    stopWhen: stepCountIs(2),
    providerOptions: {
      google: {
        thinkingConfig: {
          thinkingBudget: 0,
          includeThoughts: false,
        },
      },
      gateway: {
        order: ['vertex', 'google'],
        caching: 'auto',
      },
    },
  });

  const result = await agent.generate({
    prompt: buildPrompt({ check, context, question }),
    abortSignal,
  });

  return {
    label: check,
    finding: result.text.trim() || 'No material issues.',
  };
}

export async function executeParallelChecks(
  args: Record<string, unknown>,
  options?: { abortSignal?: AbortSignal }
) {
  const parsed = ParallelChecksArgsSchema.safeParse(args);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Invalid parallel check input.',
    };
  }

  const { context, question } = parsed.data;
  const checks = parsed.data.checks ?? DEFAULT_CHECKS;

  try {
    const results = await Promise.all(
      checks.map((check) =>
        runCheck({
          abortSignal: options?.abortSignal,
          check,
          context,
          question,
        })
      )
    );

    const issueCount = results.filter(
      (result) => !/no material issues/i.test(result.finding)
    ).length;

    return {
      ok: true,
      summary:
        issueCount > 0
          ? `Parallel checks found ${issueCount} perspective(s) with material notes.`
          : 'Parallel checks found no material issues.',
      checks: results,
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return {
        ok: false,
        error: 'Parallel checks were cancelled.',
      };
    }

    console.error('executeParallelChecks provider error:', error);
    return {
      ok: false,
      error: 'Parallel checks failed. Please try again.',
    };
  }
}
