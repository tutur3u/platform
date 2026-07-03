export interface ExtendedTimeTrackingRequest {
  id: string;
  workspace_id: string;
  user_id: string;
  task_id: string | null;
  category_id: string | null;
  title: string;
  description: string | null;
  start_time: string;
  end_time: string;
  images: string[] | null;
  approval_status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'NEEDS_INFO';
  approved_by: string | null;
  approved_at: string | null;
  rejected_by: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  needs_info_requested_by: string | null;
  needs_info_requested_at: string | null;
  needs_info_reason: string | null;
  created_at: string;
  updated_at: string;
  user: {
    id: string;
    display_name: string;
    avatar_url: string;
    user_private_details: {
      email: string;
    };
  } | null;
  category: {
    id: string;
    name: string;
    color: string;
  } | null;
  task: {
    id: string;
    name: string;
  } | null;
  approved_by_user?: {
    id: string;
    display_name: string;
  } | null;
  rejected_by_user?: {
    id: string;
    display_name: string;
  } | null;
  needs_info_requested_by_user?: {
    id: string;
    display_name: string;
  } | null;
}
