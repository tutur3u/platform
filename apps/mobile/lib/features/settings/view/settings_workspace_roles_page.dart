import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/workspace_management.dart';
import 'package:mobile/data/repositories/workspace_management_repository.dart';
import 'package:mobile/data/repositories/workspace_permissions_repository.dart';
import 'package:mobile/features/settings/view/settings_dock_search.dart';
import 'package:mobile/features/settings/view/workspace_admin_widgets.dart';
import 'package:mobile/features/settings/view/workspace_role_editor_sheet.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/nova_refresh_indicator.dart';
import 'package:mobile/widgets/pending_sync_frame.dart';

class SettingsWorkspaceRolesPage extends StatelessWidget {
  const SettingsWorkspaceRolesPage({
    this.repository,
    this.permissionsRepository,
    super.key,
  });

  final WorkspaceManagementRepository? repository;
  final WorkspacePermissionsRepository? permissionsRepository;

  @override
  Widget build(BuildContext context) {
    return RepositoryProvider(
      create: (_) => repository ?? WorkspaceManagementRepository(),
      child: _SettingsWorkspaceRolesView(
        permissionsRepository:
            permissionsRepository ?? WorkspacePermissionsRepository(),
      ),
    );
  }
}

class _SettingsWorkspaceRolesView extends StatefulWidget {
  const _SettingsWorkspaceRolesView({required this.permissionsRepository});

  final WorkspacePermissionsRepository permissionsRepository;

  @override
  State<_SettingsWorkspaceRolesView> createState() =>
      _SettingsWorkspaceRolesViewState();
}

class _SettingsWorkspaceRolesViewState
    extends State<_SettingsWorkspaceRolesView> {
  final _searchController = TextEditingController();
  bool _searchActive = false;
  String _query = '';

  bool _loading = true;
  bool _canManageRoles = false;
  String? _error;
  int _loadToken = 0;
  WorkspaceRoleDetail? _defaultRole;
  List<WorkspaceRoleListItem> _roles = const [];

  String? get _wsId =>
      context.read<WorkspaceCubit>().state.currentWorkspace?.id;

  @override
  void initState() {
    super.initState();
    unawaited(_loadData());
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final canCreate = _canManageRoles && !_loading;
    return BlocListener<WorkspaceCubit, WorkspaceState>(
      listenWhen: (previous, current) =>
          previous.currentWorkspace?.id != current.currentWorkspace?.id,
      listener: (context, state) => unawaited(_loadData()),
      child: NovaRefreshIndicator(
        onRefresh: _loadData,
        child: AppPageListView(
          physics: const AlwaysScrollableScrollPhysics(
            parent: BouncingScrollPhysics(),
          ),
          children: [
            SettingsDockSearch(
              ownerId: 'settings-workspace-roles',
              location: Routes.settingsWorkspaceRoles,
              controller: _searchController,
              hint: l10n.settingsWorkspaceRolesSearchPlaceholder,
              active: _searchActive,
              onActiveChanged: (active) =>
                  setState(() => _searchActive = active),
              onChanged: (value) => setState(() => _query = value),
              actions: [
                if (canCreate)
                  ShellActionSpec(
                    id: 'settings-workspace-roles-create',
                    icon: AppIcons.add,
                    tooltip: l10n.settingsWorkspaceRolesCreate,
                    onPressed: () => unawaited(_openEditor()),
                  ),
              ],
              fallback: Padding(
                padding: const EdgeInsets.only(bottom: AppLayout.sectionGap),
                child: Row(
                  children: [
                    Expanded(
                      child: AppSearchField(
                        controller: _searchController,
                        placeholder:
                            l10n.settingsWorkspaceRolesSearchPlaceholder,
                        onChanged: (value) => setState(() => _query = value),
                      ),
                    ),
                    if (canCreate) ...[
                      const SizedBox(width: AppSpacing.sm),
                      AppIconButton(
                        key: const ValueKey('workspace-roles-create'),
                        variant: AppButtonVariant.primary,
                        tooltip: l10n.settingsWorkspaceRolesCreate,
                        icon: const Icon(AppIcons.add),
                        onPressed: () => unawaited(_openEditor()),
                      ),
                    ],
                  ],
                ),
              ),
            ),
            WorkspaceRolesView(
              workspaceId: _wsId ?? '',
              loading: _loading,
              canManage: _canManageRoles,
              error: _error,
              query: _query,
              defaultRole: _defaultRole,
              roles: _roles,
              onRetry: () => unawaited(_loadData()),
              onOpenDefault: () => unawaited(_openEditor(forceDefault: true)),
              onOpenRole: (role) => unawaited(_openEditor(role: role)),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _loadData() async {
    final workspace = context.read<WorkspaceCubit>().state.currentWorkspace;
    final wsId = workspace?.id;
    final token = ++_loadToken;
    if (wsId == null || wsId.isEmpty) {
      setState(() {
        _loading = false;
        _canManageRoles = false;
        _roles = const [];
        _defaultRole = null;
      });
      return;
    }
    setState(() {
      _loading = _defaultRole == null;
      _error = null;
    });
    try {
      final repository = context.read<WorkspaceManagementRepository>();
      final permissions = await widget.permissionsRepository.getPermissions(
        wsId: wsId,
      );
      final canManageRoles =
          workspace?.personal == true ||
          permissions.containsPermission(manageWorkspaceRolesPermission);
      if (!canManageRoles) {
        if (!mounted || token != _loadToken) return;
        setState(() {
          _loading = false;
          _canManageRoles = false;
          _roles = const [];
          _defaultRole = null;
        });
        return;
      }
      final results = await Future.wait<Object>([
        repository.getDefaultRole(wsId),
        repository.getRoles(wsId),
      ]);
      if (!mounted || token != _loadToken) return;
      setState(() {
        _loading = false;
        _canManageRoles = true;
        _defaultRole = results[0] as WorkspaceRoleDetail;
        _roles = results[1] as List<WorkspaceRoleListItem>;
      });
    } on Exception catch (error) {
      if (!mounted || token != _loadToken) return;
      setState(() {
        _loading = false;
        _error = describeWorkspaceAdminError(context, error);
      });
    }
  }

  Future<void> _openEditor({
    WorkspaceRoleListItem? role,
    bool forceDefault = false,
  }) async {
    final wsId = _wsId;
    if (wsId == null) return;
    final l10n = context.l10n;
    final repository = context.read<WorkspaceManagementRepository>();
    final result = await showWorkspaceRoleEditor(
      context: context,
      repository: repository,
      wsId: wsId,
      roleId: role?.id,
      forceDefault: forceDefault,
    );
    if (!mounted) return;
    switch (result) {
      case WorkspaceRoleEditorResult.saved:
        showAppToast(
          context,
          message: l10n.settingsWorkspaceRolesSaved,
          variant: AppAlertVariant.success,
        );
        await _loadData();
      case WorkspaceRoleEditorResult.delete when role != null:
        final deleted = await showAppAsyncConfirmDialog(
          context: context,
          title: l10n.settingsWorkspaceRolesDeleteTitle,
          message: l10n.settingsWorkspaceRolesDeleteMessage(role.name),
          confirmLabel: l10n.settingsWorkspaceRolesDeleteTitle,
          cancelLabel: l10n.commonCancel,
          describeError: (error) => describeWorkspaceAdminError(context, error),
          onConfirm: () => repository.deleteRole(wsId: wsId, roleId: role.id),
        );
        if (deleted && mounted) await _loadData();
      case WorkspaceRoleEditorResult.delete:
      case null:
        break;
    }
  }
}

/// Default access and the custom roles of one workspace.
class WorkspaceRolesView extends StatelessWidget {
  const WorkspaceRolesView({
    required this.workspaceId,
    required this.loading,
    required this.canManage,
    required this.roles,
    required this.onRetry,
    required this.onOpenDefault,
    required this.onOpenRole,
    this.defaultRole,
    this.error,
    this.query = '',
    super.key,
  });

  final String workspaceId;
  final bool loading;
  final bool canManage;
  final String? error;
  final String query;
  final WorkspaceRoleDetail? defaultRole;
  final List<WorkspaceRoleListItem> roles;
  final VoidCallback onRetry;
  final VoidCallback onOpenDefault;
  final ValueChanged<WorkspaceRoleListItem> onOpenRole;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    if (loading) {
      return AppGroupedSection(
        caption: l10n.settingsWorkspaceRolesListTitle,
        children: const [AppSkeletonRows(count: 3)],
      );
    }
    if (error case final error?) {
      return AppStateMessage(
        icon: LucideIcons.circleAlert,
        tone: AppTone.destructive,
        title: l10n.commonSomethingWentWrong,
        message: error,
        actionLabel: l10n.commonRetry,
        onAction: onRetry,
      );
    }
    if (!canManage) {
      return AppStateMessage(
        icon: LucideIcons.lock,
        title: l10n.settingsWorkspaceRolesAccessDenied,
      );
    }
    final needle = query.trim().toLowerCase();
    final filtered =
        roles.where((role) => role.name.toLowerCase().contains(needle)).toList()
          ..sort(
            (a, b) => a.name.toLowerCase().compareTo(b.name.toLowerCase()),
          );
    final enabledDefaults =
        defaultRole?.permissions.where((entry) => entry.enabled).length ?? 0;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (needle.isEmpty)
          AppGroupedSection.spaced(
            children: [
              AppGroupedRow(
                key: const ValueKey('workspace-roles-default'),
                leading: const AppIconTile(
                  icon: LucideIcons.shield,
                  tone: AppTone.primary,
                ),
                title: Text(l10n.settingsWorkspaceRolesDefaultTitle),
                subtitle: Text(
                  l10n.settingsWorkspaceRolesPermissionCount(enabledDefaults),
                ),
                showChevron: true,
                onTap: onOpenDefault,
              ),
            ],
          ),
        AppGroupedSection(
          caption: l10n.settingsWorkspaceRolesListTitle,
          children: filtered.isEmpty
              ? [
                  AppStateMessage.inline(
                    icon: needle.isEmpty
                        ? LucideIcons.userCog
                        : LucideIcons.searchX,
                    title: needle.isEmpty
                        ? l10n.settingsWorkspaceRolesEmpty
                        : l10n.commonNoSearchResults,
                  ),
                ]
              : [
                  for (final role in filtered)
                    PendingSyncFrame(
                      workspaceId: workspaceId,
                      entityId: role.id,
                      feature: 'workspace-management',
                      child: AppGroupedRow(
                        key: ValueKey('workspace-role-${role.id}'),
                        leading: const AppIconTile(icon: LucideIcons.userCog),
                        title: Text(role.name),
                        showChevron: true,
                        onTap: () => onOpenRole(role),
                      ),
                    ),
                ],
        ),
      ],
    );
  }
}
