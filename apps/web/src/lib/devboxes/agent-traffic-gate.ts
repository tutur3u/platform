import { NextResponse } from 'next/server';

export const DEVBOX_AGENT_API_ENABLED_ENV = 'TUTURUUU_DEVBOX_AGENT_API_ENABLED';

const ENABLED_VALUES = new Set(['1', 'true', 'yes', 'on']);

export function isDevboxAgentApiEnabled(
  env: Record<string, string | undefined> = process.env
) {
  return ENABLED_VALUES.has(
    (env[DEVBOX_AGENT_API_ENABLED_ENV] ?? '').trim().toLowerCase()
  );
}

export function createDevboxAgentApiDisabledResponse() {
  return NextResponse.json(
    {
      message: `Devbox agent poll and heartbeat are disabled. Set ${DEVBOX_AGENT_API_ENABLED_ENV}=true to enable them.`,
    },
    { status: 403 }
  );
}
