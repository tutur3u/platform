import type { HiveAccessRequest, HiveMember } from '@tuturuuu/internal-api';
import type { PlatformUser, User, UserPrivateDetails } from '@tuturuuu/types';

export type SearchUserResult = {
  allow_challenge_management: boolean;
  allow_discord_integrations?: boolean;
  allow_manage_all_challenges: boolean;
  allow_role_management: boolean;
  allow_workspace_creation?: boolean;
  avatar_url: string;
  bio: string;
  birthday: string;
  created_at: string;
  deleted: boolean;
  display_name: string;
  email: string;
  enabled: boolean;
  first_day_of_week?: string;
  handle: string;
  id: string;
  new_email: string;
  task_auto_assign_to_self?: boolean;
  team_name: string[];
  time_format?: string;
  timezone?: string;
  user_id: string;
};

type PlatformUserPrivateDetails = Omit<
  Partial<UserPrivateDetails>,
  'services'
> & {
  services?: UserPrivateDetails['services'] | null;
};

export type PlatformUserWithDetails = User &
  Omit<
    PlatformUser,
    'allow_workspace_creation' | 'allow_discord_integrations'
  > &
  PlatformUserPrivateDetails & {
    allow_discord_integrations?: boolean;
    allow_workspace_creation?: boolean;
  };

export type PlatformRoleStats = {
  active: number;
  admins: number;
  challengeManagers: number;
  globalManagers: number;
  inactive: number;
  members: number;
  workspaceCreators: number;
};

export type HiveAccessState = {
  available: boolean;
  members: HiveMember[];
  requests: HiveAccessRequest[];
};
