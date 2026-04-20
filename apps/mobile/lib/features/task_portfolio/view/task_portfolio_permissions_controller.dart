import 'package:mobile/data/repositories/workspace_permissions_repository.dart';

class TaskPortfolioPermissionsController {
  TaskPortfolioPermissionsController({
    required WorkspacePermissionsRepository permissionsRepository,
  }) : _permissionsRepository = permissionsRepository;

  final WorkspacePermissionsRepository _permissionsRepository;

  String? _workspaceId;
  String? _userId;
  bool _canManageProjects = false;
  bool _isCheckingPermissions = false;
  bool _hasResolvedPermissions = false;

  String? get workspaceId => _workspaceId;
  bool get canManageProjects => _canManageProjects;
  bool get isCheckingPermissions => _isCheckingPermissions;
  bool get hasResolvedPermissions => _hasResolvedPermissions;

  bool shouldReloadForWorkspace(String? wsId, {String? userId}) {
    return wsId != _workspaceId || userId != _userId;
  }

  void primeCachedPermission(String? wsId, {String? userId}) {
    _workspaceId = wsId;
    _userId = userId;
    _canManageProjects = false;
    _hasResolvedPermissions = wsId == null;
  }

  Future<void> loadPermissions({required String? wsId, String? userId}) async {
    _workspaceId = wsId;
    _userId = userId;
    _isCheckingPermissions = true;

    if (wsId == null || userId == null) {
      _canManageProjects = false;
      _isCheckingPermissions = false;
      _hasResolvedPermissions = true;
      return;
    }

    final requestWorkspaceId = wsId;
    final requestUserId = userId;

    try {
      final permissions = await _permissionsRepository.getPermissions(
        wsId: requestWorkspaceId,
        userId: requestUserId,
      );

      // Ignore stale responses after workspace changes.
      if (_workspaceId != requestWorkspaceId || _userId != requestUserId) {
        return;
      }

      _canManageProjects = permissions.containsPermission('manage_projects');
      _isCheckingPermissions = false;
      _hasResolvedPermissions = true;
    } on Exception {
      if (_workspaceId != requestWorkspaceId || _userId != requestUserId) {
        return;
      }
      _canManageProjects = false;
      _isCheckingPermissions = false;
      _hasResolvedPermissions = true;
    }
  }
}
