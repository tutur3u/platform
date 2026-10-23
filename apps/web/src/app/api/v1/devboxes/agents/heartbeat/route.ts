import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeDevboxAgent } from '@/lib/devboxes/agent-auth';
import { heartbeatDevboxRunner } from '@/lib/devboxes/agent-store';
import {
  createDevboxAgentApiDisabledResponse,
  isDevboxAgentApiEnabled,
} from '@/lib/devboxes/agent-traffic-gate';
import { restrictReportedProtocols } from '@/lib/devboxes/commit-run-guard';
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
    judge: z
      .object({
        languages: z
          .array(
            z.enum([
              'python',
              'javascript',
              'typescript',
              'c',
              'cpp',
              'java',
              'rust',
              'go',
              'ruby',
              'php',
            ])
          )
          .max(10),
        ready: z.boolean(),
        reason: NullableStringSchema,
      })
      .optional(),
    playground: z
      .object({
        ready: z.boolean(),
        languages: z
          .array(
            z.enum([
              'python',
              'javascript',
              'typescript',
              'c',
              'cpp',
              'java',
              'rust',
              'go',
              'ruby',
              'php',
              'shell',
            ])
          )
          .max(11),
        environments: z.number().int().min(0).max(8),
      })
      .strict()
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
    // Self-reported and advisory: stored for operators and later claim
    // matching, never used to grant a feature or authorize a runner.
    executionMode: z.enum(['trusted', 'judge-only']).optional(),
    // Envelope protocol versions the runner decodes; clients only submit a
    // commit run to a runner that advertises it.
    protocols: z
      .object({
        commitRun: z.array(z.number().int().min(1).max(100)).max(10),
      })
      .strict()
      .optional(),
    isolation: z
      .object({
        checkedAt: z.string().trim().max(100).optional(),
        dedicatedUser: z.boolean().optional(),
        privateTokenDirectory: z.boolean().optional(),
        protectedService: z.boolean().optional(),
        dedicatedDockerSocket: z.boolean().optional(),
        gvisorDefault: z.boolean().optional(),
        noGeneralDockerGroup: z.boolean().optional(),
      })
      .strict()
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
  if (!isDevboxAgentApiEnabled()) {
    return createDevboxAgentApiDisabledResponse();
  }

  const authorization = await authorizeDevboxAgent(request);
  if (!authorization.ok) return authorization.response;

  if (!authorization.runner.heartbeatEnabled) {
    return NextResponse.json(
      { message: 'Heartbeat disabled for this runner' },
      { status: 403 }
    );
  }

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
        // Only trusted-mode runners may advertise envelope protocols; the
        // database also drops them for Judge/playground runners.
        restrictReportedProtocols(parsed.data?.capabilities)
      )
    );
  } catch (error) {
    return createDevboxRouteErrorResponse(
      error,
      'Failed to record devbox heartbeat'
    );
  }
}
