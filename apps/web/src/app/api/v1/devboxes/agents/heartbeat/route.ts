import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeDevboxAgent } from '@/lib/devboxes/agent-auth';
import { heartbeatDevboxRunner } from '@/lib/devboxes/agent-store';
import { createDevboxRouteErrorResponse } from '@/lib/devboxes/store-utils';

const NullableStringSchema = z.string().trim().max(500).nullable();
const RunnerCapabilitiesSchema = z
  .object({
    cli: z
      .object({
        name: z.string().trim().max(50),
        version: z.string().trim().max(100),
      })
      .optional(),
    os: z
      .object({
        arch: z.string().trim().max(50).optional(),
        hostname: z.string().trim().max(255).optional(),
        platform: z.string().trim().max(50).optional(),
        release: z.string().trim().max(100).optional(),
        type: z.string().trim().max(100).optional(),
      })
      .optional(),
    reportedAt: z.string().trim().max(100).optional(),
    resources: z
      .object({
        cpu: z
          .object({
            cores: z.number().int().nonnegative().max(2048).optional(),
            model: NullableStringSchema.optional(),
          })
          .optional(),
        loadAverage: z.array(z.number().finite()).max(3).optional(),
        memory: z
          .object({
            freeBytes: z.number().nonnegative().finite().optional(),
            totalBytes: z.number().nonnegative().finite().optional(),
          })
          .optional(),
        uptimeSeconds: z.number().nonnegative().finite().optional(),
      })
      .optional(),
    runtimes: z
      .object({
        bun: NullableStringSchema.optional(),
        node: z.string().trim().max(100).optional(),
      })
      .optional(),
    tools: z
      .object({
        docker: NullableStringSchema.optional(),
        git: NullableStringSchema.optional(),
      })
      .optional(),
  })
  .strict();

const HeartbeatSchema = z
  .object({
    capabilities: RunnerCapabilitiesSchema.optional(),
  })
  .optional();

export async function POST(request: Request) {
  const authorization = await authorizeDevboxAgent(request);
  if (!authorization.ok) return authorization.response;

  const parsed = HeartbeatSchema.safeParse(
    await request.json().catch(() => undefined)
  );
  if (!parsed.success) {
    return NextResponse.json(
      { errors: parsed.error.issues, message: 'Invalid heartbeat body' },
      { status: 400 }
    );
  }

  try {
    return NextResponse.json(
      await heartbeatDevboxRunner(
        authorization.runner.id,
        parsed.data?.capabilities
      )
    );
  } catch (error) {
    return createDevboxRouteErrorResponse(
      error,
      'Failed to record devbox heartbeat'
    );
  }
}
