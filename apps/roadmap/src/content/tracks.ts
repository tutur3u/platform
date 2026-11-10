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
export const tracks: Track[] = [
  platformTrack,
  miraTrack,
  tasksTrack,
  chatTrack,
  calendarTrack,
  financeTrack,
  driveTrack,
  mailTrack,
  meetTrack,
  mobileTrack,
  mastermindTrack,
  upskiiTrack,
  securityTrack,
  dxTrack,
];
