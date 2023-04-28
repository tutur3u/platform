import { AuditLog } from '../types/primitives/AuditLog';

const getWorkspaceMembersLabel = (data: AuditLog) => {
  switch (data.op) {
    case 'INSERT':
      return 'Đã thêm 1 thành viên';
    case 'UPDATE':
      return 'Cập nhật 1 thành viên';
    case 'DELETE':
      return 'Đã xóa 1 thành viên';
  }
};

const getWorkspaceInvitesLabel = (data: AuditLog) => {
  switch (data.op) {
    case 'INSERT':
      return 'Đã thêm 1 lời mời';
    case 'UPDATE':
      return 'Cập nhật 1 lời mời';
    case 'DELETE':
      return 'Đã xóa 1 lời mời';
  }
};

export const getLabel = (data: AuditLog) => {
  switch (data.table_name) {
    case 'workspace_members':
      return getWorkspaceMembersLabel(data);
    case 'workspace_invites':
      return getWorkspaceInvitesLabel(data);

    default:
      return JSON.stringify(data);
  }
};
