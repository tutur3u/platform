import 'package:flutter/widgets.dart';

class WorkspacePermissionGroupCatalog {
  const WorkspacePermissionGroupCatalog({
    required this.id,
    required this.permissions,
  });

  final String id;
  final List<String> permissions;
}

const workspacePermissionCatalog = <WorkspacePermissionGroupCatalog>[
  WorkspacePermissionGroupCatalog(
    id: 'workspace',
    permissions: [
      'admin',
      'manage_api_keys',
      'manage_workspace_roles',
      'manage_workspace_members',
      'manage_workspace_settings',
      'manage_workspace_security',
      'manage_e2ee',
      'manage_subscription',
      'manage_external_projects',
      'publish_external_projects',
      'manage_workspace_secrets',
      'manage_workspace_audit_logs',
      'manage_changelog',
    ],
  ),
  WorkspacePermissionGroupCatalog(
    id: 'ai',
    permissions: ['ai_chat', 'ai_lab'],
  ),
  WorkspacePermissionGroupCatalog(
    id: 'calendar',
    permissions: ['manage_calendar'],
  ),
  WorkspacePermissionGroupCatalog(
    id: 'projects',
    permissions: ['manage_projects'],
  ),
  WorkspacePermissionGroupCatalog(
    id: 'documents',
    permissions: ['manage_documents'],
  ),
  WorkspacePermissionGroupCatalog(
    id: 'time-tracker',
    permissions: [
      'manage_time_tracking_requests',
      'bypass_time_tracking_request_approval',
    ],
  ),
  WorkspacePermissionGroupCatalog(
    id: 'drive',
    permissions: [
      'view_drive',
      'manage_drive',
      'manage_drive_tasks_directory',
    ],
  ),
  WorkspacePermissionGroupCatalog(
    id: 'users',
    permissions: [
      'manage_users',
      'export_users_data',
      'send_user_group_post_emails',
      'manage_user_report_templates',
      'view_users_public_info',
      'view_users_private_info',
      'create_users',
      'update_users',
      'delete_users',
      'check_user_attendance',
      'update_user_attendance',
    ],
  ),
  WorkspacePermissionGroupCatalog(
    id: 'user_groups',
    permissions: [
      'view_user_groups',
      'create_user_groups',
      'update_user_groups',
      'delete_user_groups',
      'view_user_groups_scores',
      'create_user_groups_scores',
      'update_user_groups_scores',
      'delete_user_groups_scores',
      'view_user_groups_posts',
      'create_user_groups_posts',
      'update_user_groups_posts',
      'delete_user_groups_posts',
      'view_user_groups_reports',
      'create_user_groups_reports',
      'update_user_groups_reports',
      'delete_user_groups_reports',
      'approve_reports',
      'approve_posts',
    ],
  ),
  WorkspacePermissionGroupCatalog(
    id: 'leads',
    permissions: ['create_lead_generations'],
  ),
  WorkspacePermissionGroupCatalog(
    id: 'inventory',
    permissions: [
      'view_inventory',
      'create_inventory',
      'update_inventory',
      'delete_inventory',
      'view_stock_quantity',
      'update_stock_quantity',
    ],
  ),
  WorkspacePermissionGroupCatalog(
    id: 'finance',
    permissions: [
      'manage_finance',
      'export_finance_data',
      'view_finance_stats',
      'create_wallets',
      'update_wallets',
      'delete_wallets',
      'create_transactions',
      'view_transactions',
      'update_transactions',
      'delete_transactions',
      'view_incomes',
      'view_expenses',
      'create_confidential_transactions',
      'update_confidential_transactions',
      'delete_confidential_transactions',
      'view_confidential_amount',
      'view_confidential_description',
      'view_confidential_category',
      'create_invoices',
      'view_invoices',
      'update_invoices',
      'delete_invoices',
    ],
  ),
  WorkspacePermissionGroupCatalog(
    id: 'workforce',
    permissions: [
      'manage_workforce',
      'view_workforce',
      'manage_payroll',
      'view_payroll',
    ],
  ),
  WorkspacePermissionGroupCatalog(
    id: 'infrastructure',
    permissions: [
      'view_infrastructure',
      'manage_external_migrations',
    ],
  ),
];

String workspacePermissionGroupLabel(BuildContext context, String groupId) {
  switch (groupId) {
    case 'ai':
      return 'AI';
    case 'time-tracker':
      return _isVietnamese(context) ? 'Chấm công' : 'Time Tracker';
    case 'user_groups':
      return _isVietnamese(context) ? 'Nhóm người dùng' : 'User Groups';
    default:
      return _humanize(groupId, context: context);
  }
}

String workspacePermissionLabel(BuildContext context, String permissionId) {
  const viOverrides = <String, String>{
    'admin': 'Quản trị viên',
    'manage_api_keys': 'Quản lý khóa API',
    'manage_workspace_roles': 'Quản lý vai trò',
    'manage_workspace_members': 'Quản lý thành viên',
    'manage_workspace_settings': 'Quản lý cài đặt',
    'manage_workspace_security': 'Quản lý bảo mật',
    'manage_e2ee': 'Quản lý mã hóa đầu cuối',
    'manage_subscription': 'Quản lý gói đăng ký',
    'manage_calendar': 'Quản lý lịch',
    'manage_projects': 'Quản lý dự án',
    'manage_documents': 'Quản lý tài liệu',
    'manage_time_tracking_requests': 'Quản lý yêu cầu chấm công',
    'bypass_time_tracking_request_approval': 'Bỏ qua duyệt yêu cầu chấm công',
    'view_drive': 'Xem Drive',
    'manage_drive': 'Quản lý Drive',
    'manage_drive_tasks_directory': 'Quản lý thư mục tác vụ trên Drive',
    'manage_users': 'Quản lý người dùng',
    'view_users_public_info': 'Xem thông tin công khai',
    'view_users_private_info': 'Xem thông tin riêng tư',
    'create_users': 'Tạo người dùng',
    'update_users': 'Cập nhật người dùng',
    'delete_users': 'Xóa người dùng',
    'create_inventory': 'Tạo sản phẩm kho',
    'update_inventory': 'Cập nhật sản phẩm kho',
    'delete_inventory': 'Xóa sản phẩm kho',
    'view_inventory': 'Xem kho',
    'view_stock_quantity': 'Xem tồn kho',
    'update_stock_quantity': 'Điều chỉnh tồn kho',
    'manage_finance': 'Quản lý tài chính',
    'view_finance_stats': 'Xem thống kê tài chính',
    'create_wallets': 'Tạo ví',
    'update_wallets': 'Cập nhật ví',
    'delete_wallets': 'Xóa ví',
    'create_transactions': 'Tạo giao dịch',
    'view_transactions': 'Xem giao dịch',
    'update_transactions': 'Cập nhật giao dịch',
    'delete_transactions': 'Xóa giao dịch',
    'create_invoices': 'Tạo hóa đơn',
    'view_invoices': 'Xem hóa đơn',
    'update_invoices': 'Cập nhật hóa đơn',
    'delete_invoices': 'Xóa hóa đơn',
    'manage_workforce': 'Quản lý nhân sự',
    'view_workforce': 'Xem nhân sự',
    'manage_payroll': 'Quản lý lương',
    'view_payroll': 'Xem lương',
    'view_infrastructure': 'Xem hạ tầng',
    'manage_external_migrations': 'Quản lý migration ngoài',
  };

  if (_isVietnamese(context)) {
    final label = viOverrides[permissionId];
    if (label != null) {
      return label;
    }
  }

  return _humanize(permissionId, context: context);
}

bool _isVietnamese(BuildContext context) {
  return Localizations.localeOf(context).languageCode == 'vi';
}

String _humanize(String value, {required BuildContext context}) {
  final tokens = value
      .split(RegExp('[_-]'))
      .where((token) => token.isNotEmpty)
      .toList(growable: false);
  if (tokens.isEmpty) {
    return value;
  }

  if (_isVietnamese(context)) {
    const tokenMap = <String, String>{
      'ai': 'AI',
      'api': 'API',
      'audit': 'nhật ký',
      'billing': 'thanh toán',
      'calendar': 'lịch',
      'category': 'danh mục',
      'chat': 'trò chuyện',
      'confidential': 'bí mật',
      'create': 'tạo',
      'delete': 'xóa',
      'description': 'mô tả',
      'documents': 'tài liệu',
      'drive': 'drive',
      'e2ee': 'mã hóa đầu cuối',
      'expenses': 'chi',
      'export': 'xuất',
      'external': 'bên ngoài',
      'finance': 'tài chính',
      'groups': 'nhóm',
      'incomes': 'thu',
      'infrastructure': 'hạ tầng',
      'inventory': 'kho',
      'invoices': 'hóa đơn',
      'keys': 'khóa',
      'lab': 'lab',
      'lead': 'lead',
      'generations': 'tạo lead',
      'logs': 'log',
      'manage': 'quản lý',
      'members': 'thành viên',
      'migrations': 'migration',
      'payroll': 'lương',
      'permissions': 'quyền',
      'posts': 'bài viết',
      'private': 'riêng tư',
      'projects': 'dự án',
      'public': 'công khai',
      'quantity': 'số lượng',
      'reports': 'báo cáo',
      'request': 'yêu cầu',
      'requests': 'yêu cầu',
      'roles': 'vai trò',
      'scores': 'điểm',
      'secrets': 'bí mật',
      'security': 'bảo mật',
      'send': 'gửi',
      'settings': 'cài đặt',
      'stock': 'tồn kho',
      'subscription': 'gói đăng ký',
      'tasks': 'tác vụ',
      'time': 'thời gian',
      'tracking': 'theo dõi',
      'transactions': 'giao dịch',
      'update': 'cập nhật',
      'user': 'người dùng',
      'users': 'người dùng',
      'view': 'xem',
      'wallets': 'ví',
      'workforce': 'nhân sự',
      'workspace': 'không gian làm việc',
    };

    final translated = tokens
        .map((token) => tokenMap[token.toLowerCase()] ?? token)
        .toList(growable: false);
    return translated.isEmpty
        ? value
        : '${translated.first[0].toUpperCase()}'
              '${translated.first.substring(1)} '
              '${translated.skip(1).join(' ')}';
  }

  return tokens
      .map(
        (token) => token.toUpperCase() == token
            ? token
            : '${token[0].toUpperCase()}${token.substring(1)}',
      )
      .join(' ');
}
