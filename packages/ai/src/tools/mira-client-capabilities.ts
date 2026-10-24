import { z } from 'zod';
import type { MiraToolName } from './mira-tool-names';

/**
 * UI effects a Mira client can apply after a server tool returns its marker.
 * The server only offers a client tool when the requesting client declares the
 * matching capability, so Mira never reports an effect nobody applies.
 */
export const MIRA_CLIENT_CAPABILITIES = [
  'theme',
  'sidebar',
  'artifact_panels',
  'immersive',
  'navigate',
] as const;

export type MiraClientCapability = (typeof MIRA_CLIENT_CAPABILITIES)[number];

/** Clients that predate declaration keep the effects Web chat applied then. */
export const LEGACY_MIRA_CLIENT_CAPABILITIES: readonly MiraClientCapability[] =
  ['theme', 'sidebar', 'artifact_panels', 'immersive'];

/** Unknown names are ignored so newer clients stay compatible. */
export const miraClientCapabilitiesInputSchema = z
  .array(z.string().trim().min(1).max(48))
  .max(16);

export const MIRA_CLIENT_TOOL_CAPABILITIES: Partial<
  Record<MiraToolName, MiraClientCapability>
> = {
  set_theme: 'theme',
  set_sidebar: 'sidebar',
  show_workspace_artifact: 'artifact_panels',
  manage_workspace: 'artifact_panels',
  set_immersive_mode: 'immersive',
  open_app: 'navigate',
};

/** Apps a client can switch to; each client maps these to its own routes. */
export const MIRA_APP_DESTINATIONS = [
  'home',
  'assistant',
  'tasks',
  'habits',
  'calendar',
  'finance',
  'time_tracker',
  'mail',
  'drive',
  'meet',
  'notes',
  'chat',
] as const;

export type MiraAppDestination = (typeof MIRA_APP_DESTINATIONS)[number];

export function resolveMiraClientCapabilities(
  declared: readonly string[] | null | undefined
): ReadonlySet<MiraClientCapability> {
  if (!declared) return new Set(LEGACY_MIRA_CLIENT_CAPABILITIES);
  const known = new Set<string>(MIRA_CLIENT_CAPABILITIES);
  return new Set(
    declared.filter((value): value is MiraClientCapability => known.has(value))
  );
}

export function isMiraToolAvailableToClient(
  name: string,
  capabilities: ReadonlySet<MiraClientCapability> | undefined
) {
  const required = MIRA_CLIENT_TOOL_CAPABILITIES[name as MiraToolName];
  if (!required) return true;
  return (capabilities ?? resolveMiraClientCapabilities(undefined)).has(
    required
  );
}

/**
 * Prompt note for clients that cannot apply some UI effects, so instructions
 * written for Web panels do not make Mira promise a missing effect.
 */
export function buildMiraClientCapabilityInstruction(
  capabilities: ReadonlySet<MiraClientCapability> | undefined
) {
  if (!capabilities) return '';
  const missing = MIRA_CLIENT_CAPABILITIES.filter(
    (capability) => !capabilities.has(capability)
  );
  if (!missing.length) return '';
  const lines = [
    '## Client capabilities',
    `This app cannot apply these UI effects: ${missing.join(', ')}. Their tools are unavailable; never claim they happened.`,
  ];
  if (!capabilities.has('artifact_panels')) {
    lines.push(
      capabilities.has('navigate')
        ? 'To show tasks, calendar, finance, or meetings, use open_app with the matching destination, or answer in chat.'
        : 'To show tasks, calendar, finance, or meetings, answer in chat and tell the user which app to open.'
    );
  }
  return lines.join('\n');
}
