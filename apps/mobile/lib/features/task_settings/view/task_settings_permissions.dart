import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/data/repositories/workspace_permissions_repository.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/task_settings/view/task_settings_scope.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';

/// Resolves `manage_projects` for the current workspace and user, and reloads
/// the screen's data when either changes.
mixin TaskSettingsPermissions<T extends StatefulWidget> on State<T> {
  WorkspacePermissionsRepository get permissionsRepository;

  String? _permissionsWorkspaceId;
  bool _permissionsPrimed = false;
  bool canManageProjects = false;
  bool isCheckingPermissions = false;
  bool hasResolvedPermissions = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    if (_permissionsPrimed && wsId == _permissionsWorkspaceId) return;
    _permissionsPrimed = true;
    _resetPermissions(wsId);
  }

  /// Wraps [child] with listeners that refresh permissions and data on
  /// workspace or account changes.
  Widget buildTaskSettingsListeners({required Widget child}) {
    return MultiBlocListener(
      listeners: [
        BlocListener<WorkspaceCubit, WorkspaceState>(
          listenWhen: (prev, curr) =>
              prev.currentWorkspace?.id != curr.currentWorkspace?.id,
          listener: (context, state) =>
              _onContextChanged(state.currentWorkspace?.id),
        ),
        BlocListener<AuthCubit, AuthState>(
          listenWhen: (prev, curr) => prev.user?.id != curr.user?.id,
          listener: (context, state) => _onContextChanged(
            context.read<WorkspaceCubit>().state.currentWorkspace?.id,
            forceRefresh: true,
          ),
        ),
      ],
      child: child,
    );
  }

  void _onContextChanged(String? wsId, {bool forceRefresh = false}) {
    _resetPermissions(wsId);
    if (wsId == null) return;
    unawaited(
      reloadTaskSettingsData(context, wsId, forceRefresh: forceRefresh),
    );
  }

  void _resetPermissions(String? wsId) {
    _permissionsWorkspaceId = wsId;
    canManageProjects = false;
    hasResolvedPermissions = wsId == null;
    unawaited(_loadPermissions());
  }

  Future<void> _loadPermissions() async {
    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    final userId = context.read<AuthCubit>().state.user?.id;
    _update(() => isCheckingPermissions = true);

    var canManage = false;
    if (wsId != null && userId != null) {
      try {
        final permissions = await permissionsRepository.getPermissions(
          wsId: wsId,
          userId: userId,
        );
        canManage = permissions.containsPermission('manage_projects');
      } on Exception {
        canManage = false;
      }
    }

    if (!_isCurrent(wsId, userId)) return;
    _update(() {
      canManageProjects = canManage;
      isCheckingPermissions = false;
      hasResolvedPermissions = true;
    });
  }

  bool _isCurrent(String? wsId, String? userId) {
    if (!mounted) return false;
    final currentWsId = context
        .read<WorkspaceCubit>()
        .state
        .currentWorkspace
        ?.id;
    final currentUserId = context.read<AuthCubit>().state.user?.id;
    return currentWsId == wsId && currentUserId == userId;
  }

  void _update(VoidCallback update) {
    if (!mounted) return;
    setState(update);
  }
}
