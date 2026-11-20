import 'package:mobile/core/cache/offline_read_through.dart';
import 'package:mobile/data/models/workspace_management.dart';
import 'package:mobile/data/repositories/workspace_management_repository.dart';
import 'package:mobile/data/sources/api_client.dart';

/// How far back a role may see a wallet's history.
enum WalletRoleWindow {
  oneDay('1_day'),
  threeDays('3_days'),
  sevenDays('7_days'),
  twoWeeks('2_weeks'),
  oneMonth('1_month'),
  oneQuarter('1_quarter'),
  oneYear('1_year'),
  custom('custom');

  const WalletRoleWindow(this.wire);

  final String wire;

  static WalletRoleWindow parse(Object? value) =>
      values.where((window) => window.wire == value).firstOrNull ?? oneMonth;
}

/// A role's access to one wallet.
class WalletRoleAccess {
  const WalletRoleAccess({
    required this.roleId,
    required this.roleName,
    required this.window,
    this.customDays,
  });

  factory WalletRoleAccess.fromJson(Map<String, dynamic> json) {
    final role = json['workspace_roles'];
    return WalletRoleAccess(
      roleId: json['role_id'] as String? ?? '',
      roleName: role is Map ? role['name'] as String? ?? '' : '',
      window: WalletRoleWindow.parse(json['viewing_window']),
      customDays: (json['custom_days'] as num?)?.toInt(),
    );
  }

  final String roleId;
  final String roleName;
  final WalletRoleWindow window;

  /// Days of history when [window] is custom.
  final int? customDays;
}

/// Wallet role access endpoint paths, served by the platform origin.
abstract final class FinanceWalletRoleEndpoints {
  static String roles(String wsId, String walletId) =>
      '/api/v1/workspaces/$wsId/wallets/$walletId/roles';
  static String role(String wsId, String walletId, String roleId) =>
      '/api/v1/workspaces/$wsId/wallets/$walletId/roles/$roleId';
}

/// Which workspace roles see a wallet, and how much history. Writes need a
/// connection and `manage_workspace_roles`.
class FinanceWalletRolesRepository {
  FinanceWalletRolesRepository({
    ApiClient? apiClient,
    WorkspaceManagementRepository? workspaceRepository,
  }) : _api = apiClient ?? ApiClient(),
       _workspace = workspaceRepository ?? WorkspaceManagementRepository();

  final ApiClient _api;
  final WorkspaceManagementRepository _workspace;

  Future<List<WalletRoleAccess>> list(
    String wsId,
    String walletId, {
    bool forceRefresh = false,
  }) async {
    final rows = await readThroughJsonList(
      api: _api,
      namespace: 'finance.walletRoles',
      workspaceId: wsId,
      path: FinanceWalletRoleEndpoints.roles(wsId, walletId),
      forceRefresh: forceRefresh,
    );
    return rows
        .whereType<Map<String, dynamic>>()
        .map(WalletRoleAccess.fromJson)
        .toList(growable: false);
  }

  Future<List<WorkspaceRoleListItem>> workspaceRoles(String wsId) =>
      _workspace.getRoles(wsId);

  Map<String, dynamic> _window(WalletRoleWindow window, int? customDays) => {
    'viewing_window': window.wire,
    if (window == WalletRoleWindow.custom) 'custom_days': customDays,
  };

  Future<void> grant(
    String wsId,
    String walletId, {
    required String roleId,
    required WalletRoleWindow window,
    int? customDays,
  }) => _api.postJson(FinanceWalletRoleEndpoints.roles(wsId, walletId), {
    'role_id': roleId,
    ..._window(window, customDays),
  });

  Future<void> update(
    String wsId,
    String walletId, {
    required String roleId,
    required WalletRoleWindow window,
    int? customDays,
  }) => _api.putJson(
    FinanceWalletRoleEndpoints.role(wsId, walletId, roleId),
    _window(window, customDays),
  );

  Future<void> revoke(String wsId, String walletId, String roleId) =>
      _api.deleteJson(FinanceWalletRoleEndpoints.role(wsId, walletId, roleId));
}
