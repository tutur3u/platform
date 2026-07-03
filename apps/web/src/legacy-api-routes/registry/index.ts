import { aiRouteLoaders } from './ai';
import { authRouteLoaders } from './auth';
import { billingRouteLoaders } from './billing';
import { cliRouteLoaders } from './cli';
import { cronRouteLoaders } from './cron';
import { emailRouteLoaders } from './email';
import { healthRouteLoaders } from './health';
import { inviteRouteLoaders } from './invite';
import { notificationsRouteLoaders } from './notifications';
import { paymentRouteLoaders } from './payment';
import { reportsRouteLoaders } from './reports';
import { shareRouteLoaders } from './share';
import { sync_logsRouteLoaders } from './sync_logs';
import { time_trackingRouteLoaders } from './time_tracking';
import { trpcRouteLoaders } from './trpc';
import { usersRouteLoaders } from './users';
import { v1RouteLoaders } from './v1';
import { v2RouteLoaders } from './v2';
import { workspacesRouteLoaders } from './workspaces';
import { wsIdRouteLoaders } from './wsId';

export const apiRouteLoaders = {
  ...wsIdRouteLoaders,
  ...aiRouteLoaders,
  ...authRouteLoaders,
  ...billingRouteLoaders,
  ...cliRouteLoaders,
  ...cronRouteLoaders,
  ...emailRouteLoaders,
  ...healthRouteLoaders,
  ...inviteRouteLoaders,
  ...notificationsRouteLoaders,
  ...paymentRouteLoaders,
  ...reportsRouteLoaders,
  ...shareRouteLoaders,
  ...sync_logsRouteLoaders,
  ...time_trackingRouteLoaders,
  ...trpcRouteLoaders,
  ...usersRouteLoaders,
  ...v1RouteLoaders,
  ...v2RouteLoaders,
  ...workspacesRouteLoaders,
} as const;
