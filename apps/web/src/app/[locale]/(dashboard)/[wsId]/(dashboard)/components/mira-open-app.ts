import type {
  MiraAppDestination,
  MiraClientCapability,
} from '@tuturuuu/ai/tools/mira-client-capabilities';

/** UI effects the Web Mira chat applies through `useMiraUiActionDispatcher`. */
export const WEB_MIRA_CLIENT_CAPABILITIES: MiraClientCapability[] = [
  'theme',
  'sidebar',
  'artifact_panels',
  'immersive',
  'navigate',
];

// Satellite segments are redirected to their owning app by Web's proxy.
const DESTINATION_SEGMENTS: Record<MiraAppDestination, string> = {
  home: '',
  assistant: 'assistant',
  tasks: 'tasks',
  habits: 'habits',
  calendar: 'calendar',
  finance: 'finance',
  time_tracker: 'time-tracker',
  mail: 'mail',
  drive: 'drive',
  meet: 'meet',
  notes: 'notes',
  chat: 'chat',
};

const WORKSPACE_SEGMENT = /^[A-Za-z0-9_-]{1,64}$/;

export function getMiraOpenAppPath(wsId: unknown, destination: unknown) {
  if (typeof wsId !== 'string' || !WORKSPACE_SEGMENT.test(wsId)) return null;
  if (
    typeof destination !== 'string' ||
    !Object.hasOwn(DESTINATION_SEGMENTS, destination)
  )
    return null;
  const segment = DESTINATION_SEGMENTS[destination as MiraAppDestination];
  return segment ? `/${wsId}/${segment}` : `/${wsId}`;
}
