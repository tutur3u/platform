export interface EducationAccessRequest {
  id: string;
  ws_id: string;
  workspace_name: string;
  creator_id: string;
  message: string;
  status: 'pending' | 'approved' | 'rejected';
  admin_notes?: string;
  reviewed_by?: string;
  reviewed_at?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateEducationAccessRequestPayload {
  workspaceName: string;
  message: string;
}

export interface UpdateEducationAccessRequestPayload {
  status: 'approved' | 'rejected';
  admin_notes?: string;
}
