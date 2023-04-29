import { AuditLog, Operation } from '../types/primitives/AuditLog';

const getLeadingLabel = (op: Operation) => {
  switch (op) {
    case 'INSERT':
      return 'đã thêm';
    case 'UPDATE':
      return 'đã cập nhật';
    case 'DELETE':
      return 'đã xóa';
  }
};

const getTrailingLabel = (data: AuditLog) => {
  switch (data.table_name) {
    case 'workspace_members':
      return 'thành viên';

    case 'workspace_invites':
      return 'lời mời tham gia';

    case 'workspace_teams':
      return 'nhóm';

    case 'workspace_documents':
      return 'tài liệu';

    case 'workspace_boards':
      return 'bảng công việc';

    case 'workspace_wallets':
      return 'nguồn tiền';

    case 'product_categories':
      return 'danh mục sản phẩm';

    case 'inventory_units':
      return 'đơn vị tính';

    case 'workspace_products':
      return 'sản phẩm';

    case 'inventory_suppliers':
      return 'nhà cung cấp';

    case 'inventory_warehouses':
      return 'kho chứa';

    case 'transaction_categories':
      return 'danh mục giao dịch';

    case 'healthcare_vitals':
      return 'chỉ số sức khỏe';

    case 'healthcare_diagnoses':
      return 'chuẩn đoán';

    case 'healthcare_vital_groups':
      return 'nhóm chỉ số sức khỏe';

    case 'workspace_users':
      return 'người dùng';

    case 'workspace_user_roles':
      return 'vai trò người dùng';

    case 'workspaces':
      return 'không gian làm việc';

    default:
      return JSON.stringify(data);
  }
};

const getAmount = (data: AuditLog) => {
  switch (data.table_name) {
    case 'workspaces':
      return '';
  }

  return 1;
};

export const getLabel = (data: AuditLog) => {
  const leadingLabel = getLeadingLabel(data.op);
  const trailingLabel = getTrailingLabel(data);
  const amount = getAmount(data);

  const label = `${leadingLabel} ${amount} ${trailingLabel}`;

  return label;
};
