import { GraduationCap } from '@tuturuuu/icons';
import type { MeetToolDefinition } from '../live-activities/meet-tool';
import { UpskiiToolPanel } from './upskii-tool-panel';

/**
 * The Upskii presenter activity: a host presents a lesson or launches an
 * assessment from their linked Upskii account, and the room sees its link.
 */
export const upskiiTool: MeetToolDefinition = {
  id: 'upskii',
  label: 'meet.call.upskii.title',
  icon: GraduationCap,
  Panel: UpskiiToolPanel,
};
