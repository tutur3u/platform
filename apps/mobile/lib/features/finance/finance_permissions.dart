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
      // No workspace or actor yet means grants are still to come.
      ready:
          _permissions != null &&
          snapshot.connectionState == ConnectionState.done,
      child: widget.child,
    ),
  );
}

class _FinanceGrants extends InheritedWidget {
  const _FinanceGrants({
    required this.permissions,
    required super.child,
    this.ready = true,
  });

  final WorkspacePermissions? permissions;

  /// The grant request has settled, with or without permissions.
  final bool ready;

  @override
  bool updateShouldNotify(_FinanceGrants oldWidget) =>
      permissions != oldWidget.permissions || ready != oldWidget.ready;
}

/// Whether finance grants have settled, so a denial is final.
bool financeGrantsReady(BuildContext context, {bool listen = true}) =>
    (listen
            ? context.dependOnInheritedWidgetOfExactType<_FinanceGrants>()
            : context.getInheritedWidgetOfExactType<_FinanceGrants>())
        ?.ready ??
    true;

/// Reports, after each frame where it changes, whether finance grants have
/// settled.
class FinanceGrantsReady extends StatefulWidget {
  const FinanceGrantsReady({
    required this.onChanged,
    required this.child,
    super.key,
  });

  final ValueChanged<bool> onChanged;
  final Widget child;

  @override
  State<FinanceGrantsReady> createState() => _FinanceGrantsReadyState();
}

class _FinanceGrantsReadyState extends State<FinanceGrantsReady> {
  bool? _reported;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final ready = financeGrantsReady(context);
    if (_reported == ready) return;
    _reported = ready;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted && _reported == ready) widget.onChanged(ready);
    });
  }

  @override
  Widget build(BuildContext context) => widget.child;
}

/// Supplies fixed finance grants to [child] in widget tests.
@visibleForTesting
class FinanceTestGrants extends StatelessWidget {
  const FinanceTestGrants({
    required this.permissions,
    required this.child,
    this.ready = true,
    super.key,
  });

  final WorkspacePermissions? permissions;
  final Widget child;
  final bool ready;

  @override
  Widget build(BuildContext context) =>
      _FinanceGrants(permissions: permissions, ready: ready, child: child);
}
