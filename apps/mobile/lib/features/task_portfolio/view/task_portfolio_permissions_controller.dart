import 'package:mobile/data/repositories/workspace_permissions_repository.dart';

class TaskPortfolioPermissionsController {
  TaskPortfolioPermissionsController({
    required WorkspacePermissionsRepository permissionsRepository,
  }) : _permissionsRepository = permissionsRepository;

  final WorkspacePermissionsRepository _permissionsRepository;

  String? _workspaceId;
  bool _canManageProjects = false;
  bool _isCheckingPermissions = false;
  bool _hasResolvedPermissions = false;

  String? get workspaceId => _workspaceId;
  bool get canManageProjects => _canManageProjects;
  bool get isCheckingPermissions => _isCheckingPermissions;
  bool get hasResolvedPermissions => _hasResolvedPermissions;

  bool shouldReloadForWorkspace(String? wsId) => wsId != _workspaceId;

  void primeCachedPermission(String? wsId) {
    _workspaceId = wsId;
    _canManageProjects = false;
    _hasResolvedPermissions = wsId == null;
  }

  Future<void> loadPermissions({required String? wsId}) async {
    _workspaceId = wsId;
    _isCheckingPermissions = true;

    if (wsId == null) {
      _canManageProjects = false;
      _isCheckingPermissions = false;
      _hasResolvedPermissions = true;
      return;
    }

    final requestWorkspaceId = wsId;

    try {
      final permissions = await _permissionsRepository.getPermissions(
        wsId: requestWorkspaceId,
      );

      // Ignore stale responses after workspace changes.
      if (_workspaceId != requestWorkspaceId) {
        return;
      }

      _canManageProjects = permissions.containsPermission('manage_projects');
      _isCheckingPermissions = false;
      _hasResolvedPermissions = true;
    } on Exception {
      if (_workspaceId != requestWorkspaceId) {
        return;
      }
      _canManageProjects = false;
      _isCheckingPermissions = false;
      _hasResolvedPermissions = true;
    }
  }
}
