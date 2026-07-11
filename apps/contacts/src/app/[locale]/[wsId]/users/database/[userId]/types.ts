import type { Database, WorkspaceUserReport } from '@tuturuuu/types';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import type { ReactNode } from 'react';

export const EMAIL_PAGE_SIZE = 10;

export type UserDetail = WorkspaceUser & {
  referrer?: {
    id: string;
    display_name: string | null;
    has_require_attention_feedback?: boolean;
  };
  updated_at?: string | null;
  group_count?: number;
  linked_users?: { id: string; display_name: string | null }[];
};

export type UserGroupMembership = {
  id: string;
  name: string | null;
  sessions: string[] | null;
  starting_date?: string | null;
  ending_date?: string | null;
  workspace_user_groups_users?:
    | {
        user_id: string;
        role: string | null;
      }[]
    | null;
};

export type SentEmail = Database['public']['Tables']['sent_emails']['Row'];

export type WorkspaceSettings = {
  referral_count_cap: number;
  referral_increment_percent: number;
  referral_reward_type: 'REFERRER' | 'RECEIVER' | 'BOTH';
  referral_promotion_id: string | null;
} | null;

export type LinkedPromotionItem = {
  id: string;
  name: string | null;
  description: string | null;
  code: string | null;
  value: number | null;
  use_ratio: boolean | null;
};

export type UserDetailMetric = {
  label: string;
  value: number | string;
  description?: string;
};

export type UserDetailTab = {
  value: string;
  label: string;
  count?: number;
  content: ReactNode;
};

export type UserReport = WorkspaceUserReport;
