export type CurrentUserProfileResponse = {
  banner_url?: string | null;
  bio?: string | null;
  handle?: string | null;
  id: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
  full_name: string | null;
  new_email: string | null;
  created_at: string;
  default_workspace_id: string | null;
};

export type UpdateCurrentUserProfilePayload = {
  banner_url?: string | null;
  bio?: string | null;
  handle?: string | null;
  avatar_url?: string | null;
  display_name?: string | null;
  full_name?: string | null;
};
