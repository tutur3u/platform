import 'package:flutter/widgets.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/data/repositories/workspace_permissions_repository.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';

bool canManageFinance(
  BuildContext context,
  String permission, {
  bool listen = true,
}) {
  final scope = listen
      ? context.dependOnInheritedWidgetOfExactType<_FinanceGrants>()
      : context.getInheritedWidgetOfExactType<_FinanceGrants>();
  return scope == null ||
      (scope.permissions?.containsPermission(permission) ?? false);
}

class FinancePermissionScope extends StatelessWidget {
  const FinancePermissionScope({required this.child, super.key});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthCubit?>();
    if (auth == null) return child;
    final actor = auth.state.user?.id;
    final workspace = context
        .watch<WorkspaceCubit>()
        .state
        .currentWorkspace
        ?.id;
    return _FinancePermissionRequest(
      actor: actor,
      workspace: workspace,
      child: child,
    );
  }
}

class _FinancePermissionRequest extends StatefulWidget {
  const _FinancePermissionRequest({
    required this.actor,
    required this.workspace,
    required this.child,
  });

  final String? actor;
  final String? workspace;
  final Widget child;

  @override
  State<_FinancePermissionRequest> createState() =>
      _FinancePermissionRequestState();
}

class _FinancePermissionRequestState extends State<_FinancePermissionRequest> {
  late Future<WorkspacePermissions>? _permissions = _load();

  Future<WorkspacePermissions>? _load() {
    final workspace = widget.workspace;
    final actor = widget.actor;
    if (workspace == null || actor == null) return null;
    return WorkspacePermissionsRepository().getPermissions(
      wsId: workspace,
      userId: actor,
    );
  }

  @override
  void didUpdateWidget(_FinancePermissionRequest oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.actor != widget.actor ||
        oldWidget.workspace != widget.workspace) {
      _permissions = _load();
    }
  }

  @override
  Widget build(BuildContext context) => FutureBuilder(
    future: _permissions,
    builder: (context, snapshot) => _FinanceGrants(
      permissions: snapshot.connectionState == ConnectionState.done
          ? snapshot.data
          : null,
      child: widget.child,
    ),
  );
}

class _FinanceGrants extends InheritedWidget {
  const _FinanceGrants({required this.permissions, required super.child});

  final WorkspacePermissions? permissions;

  @override
  bool updateShouldNotify(_FinanceGrants oldWidget) =>
      permissions != oldWidget.permissions;
}
