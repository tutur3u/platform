import type { Track } from '../live/status.ts';
import { platformTrack } from './tracks/platform.ts';
import { miraTrack } from './tracks/mira.ts';
import { tasksTrack } from './tracks/tasks.ts';
import { chatTrack } from './tracks/chat.ts';
import { calendarTrack } from './tracks/calendar.ts';
import { financeTrack } from './tracks/finance.ts';
import { driveTrack } from './tracks/drive.ts';
import { mailTrack } from './tracks/mail.ts';
import { meetTrack } from './tracks/meet.ts';
import { mobileTrack } from './tracks/mobile.ts';
import { mastermindTrack } from './tracks/mastermind.ts';
import { upskiiTrack } from './tracks/upskii.ts';
import { securityTrack } from './tracks/security.ts';
import { dxTrack } from './tracks/dx.ts';
import { workspaceTrack } from './tracks/workspace.ts';
import { aiStudioTrack } from './tracks/ai-studio.ts';
import { desktopTrack } from './tracks/desktop.ts';
import { formsTrack } from './tracks/forms.ts';
import { trackTrack } from './tracks/track.ts';
import { cmsTrack } from './tracks/cms.ts';
import { inventoryTrack } from './tracks/inventory.ts';
import { payTrack } from './tracks/pay.ts';
import { contactsTrack } from './tracks/contacts.ts';
import { novaTrack } from './tracks/nova.ts';
import { tulletinTrack } from './tracks/tulletin.ts';
import { colabTrack } from './tracks/colab.ts';
import { extraMilestones } from './track-history.ts';

/**
 * Show the "Coming soon" Mira subscription plans card. Default ON. Set to
 * false to hide it; nothing else changes (copy lives in coming-soon.ts).
 */
export const showPlans = true;

/**
 * Curated public roadmap, one file per track. Every PR number is a public PR
 * in tutur3u/platform. Status is never written here: it is derived from live
 * PR state and the app's deployed commit (see src/live/status.ts). Items
 * without a PR stay planned or in progress, with no claims.
 */
/** Up-next milestones lead each track; "Earlier" milestones close it. */
function withExtras(track: Track): Track {
  const extra = extraMilestones[track.id] ?? [];
  const upNext = extra.filter((m) => m.id.endsWith('-up-next'));
  const earlier = extra.filter((m) => !m.id.endsWith('-up-next'));
  return { ...track, milestones: [...upNext, ...track.milestones, ...earlier] };
}

export const tracks: Track[] = [
  platformTrack,
  workspaceTrack,
  miraTrack,
  aiStudioTrack,
  tasksTrack,
  chatTrack,
  calendarTrack,
  financeTrack,
  driveTrack,
  mailTrack,
  meetTrack,
  mobileTrack,
  desktopTrack,
  formsTrack,
  trackTrack,
  cmsTrack,
  inventoryTrack,
  payTrack,
  contactsTrack,
  upskiiTrack,
  novaTrack,
  tulletinTrack,
  colabTrack,
  mastermindTrack,
  securityTrack,
  dxTrack,
].map(withExtras);
