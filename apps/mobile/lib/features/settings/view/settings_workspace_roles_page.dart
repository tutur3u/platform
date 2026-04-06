import 'dart:async';

import 'package:flutter/material.dart' hide AppBar, Scaffold;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/responsive/responsive_padding.dart';
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:mobile/core/responsive/responsive_wrapper.dart';
import 'package:mobile/data/models/workspace_management.dart';
import 'package:mobile/data/repositories/workspace_management_repository.dart';
import 'package:mobile/data/repositories/workspace_permissions_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/finance/widgets/finance_modal_scaffold.dart';
import 'package:mobile/features/finance/widgets/finance_ui.dart';
import 'package:mobile/features/settings/view/workspace_role_permission_catalog.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/async_delete_confirmation_dialog.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class SettingsWorkspaceRolesPage extends StatelessWidget {
  const SettingsWorkspaceRolesPage({super.key});

  @override
  Widget build(BuildContext context) {
    return RepositoryProvider(
      create: (_) => WorkspaceManagementRepository(),
      child: const _SettingsWorkspaceRolesView(),
    );
  }
}

class _SettingsWorkspaceRolesView extends StatefulWidget {
  const _SettingsWorkspaceRolesView();

  @override
  State<_SettingsWorkspaceRolesView> createState() =>
      _SettingsWorkspaceRolesViewState();
}

class _SettingsWorkspaceRolesViewState
    extends State<_SettingsWorkspaceRolesView> {
  late final WorkspacePermissionsRepository _permissionsRepository;

  bool _loading = true;
  bool _canManageRoles = false;
  String? _error;
  WorkspaceRoleDetail? _defaultRole;
  List<WorkspaceRoleListItem> _roles = const [];

  @override
  void initState() {
    super.initState();
    _permissionsRepository = WorkspacePermissionsRepository();
    unawaited(_loadData());
  }

  @override
  Widget build(BuildContext context) {
    final horizontalPadding = ResponsivePadding.horizontal(
      context.deviceClass,
    );
    final l10n = context.l10n;

    return BlocListener<WorkspaceCubit, WorkspaceState>(
      listenWhen: (previous, current) =>
          previous.currentWorkspace?.id != current.currentWorkspace?.id,
      listener: (context, state) => unawaited(_loadData()),
      child: shad.Scaffold(
        child: RefreshIndicator.adaptive(
          onRefresh: _loadData,
          child: ResponsiveWrapper(
            maxWidth: ResponsivePadding.maxContentWidth(context.deviceClass),
            child: ListView(
              physics: const AlwaysScrollableScrollPhysics(
                parent: BouncingScrollPhysics(),
              ),
              padding: EdgeInsets.fromLTRB(
                horizontalPadding,
                20,
                horizontalPadding,
                32,
              ),
              children: [
                FinancePanel(
                  radius: 26,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          FinanceStatChip(
                            label: l10n.settingsWorkspaceRolesDefaultTitle,
                            value: _permissionCountLabel(
                              _defaultRole?.permissions ?? const [],
                            ),
                            icon: Icons.lock_open_rounded,
                          ),
                          FinanceStatChip(
                            label: l10n.settingsWorkspaceRolesListTitle,
                            value: '${_roles.length}',
                            icon: Icons.admin_panel_settings_outlined,
                          ),
                        ],
                      ),
                      const shad.Gap(14),
                      shad.PrimaryButton(
                        onPressed: !_canManageRoles || _loading
                            ? null
                            : _onCreateRole,
                        child: Text(l10n.settingsWorkspaceRolesCreate),
                      ),
                    ],
                  ),
                ),
                const shad.Gap(16),
                if (_loading)
                  const Padding(
                    padding: EdgeInsets.symmetric(vertical: 48),
                    child: Center(child: shad.CircularProgressIndicator()),
                  )
                else if (_error != null)
                  _SettingsStatePanel(
                    message: _error!,
                    actionLabel: l10n.commonRetry,
                    onPressed: _loadData,
                  )
                else if (!_canManageRoles)
                  _SettingsStatePanel(
                    message: l10n.settingsWorkspaceRolesAccessDenied,
                  )
                else ...[
                  FinanceSectionHeader(
                    title: l10n.settingsWorkspaceRolesDefaultTitle,
                  ),
                  const shad.Gap(10),
                  _RoleSummaryCard(
                    title: l10n.settingsWorkspaceRolesDefaultTitle,
                    subtitle: _permissionCountLabel(
                      _defaultRole?.permissions ?? const [],
                    ),
                    onTap: _defaultRole == null ? null : _onEditDefaultRole,
                  ),
                  const shad.Gap(18),
                  FinanceSectionHeader(
                    title: l10n.settingsWorkspaceRolesListTitle,
                  ),
                  const shad.Gap(10),
                  if (_roles.isEmpty)
                    _SettingsStatePanel(
                      message: l10n.settingsWorkspaceRolesEmpty,
                    )
                  else
                    ..._roles.map(
                      (role) => Padding(
                        padding: const EdgeInsets.only(bottom: 12),
                        child: _RoleSummaryCard(
                          title: role.name,
                          onTap: () => _onEditRole(role),
                          trailing: shad.GhostButton(
                            density: shad.ButtonDensity.compact,
                            onPressed: () => _onDeleteRole(role),
                            child: const Icon(Icons.delete_outline_rounded),
                          ),
                        ),
                      ),
                    ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _loadData() async {
    final workspace = context.read<WorkspaceCubit>().state.currentWorkspace;
    final wsId = workspace?.id;
    if (wsId == null || wsId.isEmpty) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _canManageRoles = false;
        _roles = const [];
        _defaultRole = null;
      });
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final repository = context.read<WorkspaceManagementRepository>();
      final permissions = await _permissionsRepository.getPermissions(
        wsId: wsId,
      );
      final canManageRoles =
          workspace?.personal == true ||
          permissions.containsPermission(manageWorkspaceRolesPermission);

      if (!canManageRoles) {
        if (!mounted) return;
        setState(() {
          _loading = false;
          _canManageRoles = false;
          _roles = const [];
          _defaultRole = null;
        });
        return;
      }

      final results = await Future.wait<dynamic>([
        repository.getDefaultRole(wsId),
        repository.getRoles(wsId),
      ]);

      if (!mounted) return;
      setState(() {
        _loading = false;
        _canManageRoles = true;
        _defaultRole = results[0] as WorkspaceRoleDetail;
        _roles = results[1] as List<WorkspaceRoleListItem>;
      });
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = error.message;
      });
    } on Exception catch (_) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = context.l10n.commonSomethingWentWrong;
      });
    }
  }

  Future<void> _onCreateRole() async {
    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    if (wsId == null) return;
    final repository = context.read<WorkspaceManagementRepository>();
    final changed = await showFinanceFullscreenModal<bool>(
      context: context,
      builder: (_) => RepositoryProvider.value(
        value: repository,
        child: WorkspaceRoleEditorPage(wsId: wsId),
      ),
    );
    if (changed == true && mounted) {
      await _loadData();
    }
  }

  Future<void> _onEditRole(WorkspaceRoleListItem role) async {
    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    if (wsId == null) return;
    final repository = context.read<WorkspaceManagementRepository>();
    final changed = await showFinanceFullscreenModal<bool>(
      context: context,
      builder: (_) => RepositoryProvider.value(
        value: repository,
        child: WorkspaceRoleEditorPage(
          wsId: wsId,
          roleId: role.id,
        ),
      ),
    );
    if (changed == true && mounted) {
      await _loadData();
    }
  }

  Future<void> _onEditDefaultRole() async {
    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    if (wsId == null) return;
    final repository = context.read<WorkspaceManagementRepository>();
    final changed = await showFinanceFullscreenModal<bool>(
      context: context,
      builder: (_) => RepositoryProvider.value(
        value: repository,
        child: WorkspaceRoleEditorPage(
          wsId: wsId,
          forceDefault: true,
        ),
      ),
    );
    if (changed == true && mounted) {
      await _loadData();
    }
  }

  Future<void> _onDeleteRole(WorkspaceRoleListItem role) async {
    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    if (wsId == null) return;
    final deleted =
        await shad.showDialog<bool>(
          context: context,
          builder: (_) => AsyncDeleteConfirmationDialog(
            title: context.l10n.settingsWorkspaceRolesDeleteTitle,
            message: context.l10n.settingsWorkspaceRolesDeleteMessage(
              role.name,
            ),
            cancelLabel: context.l10n.commonCancel,
            confirmLabel: context.l10n.settingsWorkspaceRolesDeleteTitle,
            toastContext: Navigator.of(context, rootNavigator: true).context,
            onConfirm: () => context
                .read<WorkspaceManagementRepository>()
                .deleteRole(wsId: wsId, roleId: role.id),
          ),
        ) ??
        false;
    if (!deleted || !mounted) return;
    await _loadData();
  }

  String _permissionCountLabel(List<WorkspaceRolePermissionState> permissions) {
    final enabledCount = permissions
        .where((permission) => permission.enabled)
        .length;
    return context.l10n.settingsWorkspaceRolesPermissionCount(enabledCount);
  }
}

class WorkspaceRoleEditorPage extends StatefulWidget {
  const WorkspaceRoleEditorPage({
    required this.wsId,
    this.roleId,
    this.forceDefault = false,
    super.key,
  });

  final String wsId;
  final String? roleId;
  final bool forceDefault;

  @override
  State<WorkspaceRoleEditorPage> createState() =>
      _WorkspaceRoleEditorPageState();
}

class _WorkspaceRoleEditorPageState extends State<WorkspaceRoleEditorPage> {
  late final TextEditingController _nameController;
  final Map<String, bool> _permissions = {
    for (final group in workspacePermissionCatalog)
      for (final permission in group.permissions) permission: false,
  };
  final Set<String> _selectedMemberIds = <String>{};

  bool _loading = true;
  bool _saving = false;
  String? _nameError;
  String? _error;
  List<WorkspaceMemberListItem> _availableMembers = const [];
  Set<String> _currentMemberIds = const <String>{};

  @override
  void initState() {
    super.initState();
    _nameController = TextEditingController();
    unawaited(_load());
  }

  @override
  void dispose() {
    _nameController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return FinanceFullscreenFormScaffold(
      title: widget.forceDefault
          ? l10n.settingsWorkspaceRolesDefaultTitle
          : widget.roleId == null
          ? l10n.settingsWorkspaceRolesCreate
          : l10n.settingsWorkspaceRolesEdit,
      primaryActionLabel: widget.roleId == null && !widget.forceDefault
          ? l10n.settingsWorkspaceRolesCreate
          : l10n.settingsWorkspaceRolesSave,
      isSaving: _saving,
      onPrimaryPressed: _saving ? null : _save,
      child: _loading
          ? const Center(child: shad.CircularProgressIndicator())
          : _error != null
          ? _SettingsStatePanel(
              message: _error!,
              actionLabel: l10n.commonRetry,
              onPressed: _load,
            )
          : ListView(
              physics: const BouncingScrollPhysics(),
              children: [
                if (!widget.forceDefault) ...[
                  FinanceFormSection(
                    title: l10n.settingsWorkspaceRolesNameField,
                    child: _FinanceStyleTextField(
                      controller: _nameController,
                      placeholder: l10n.settingsWorkspaceRolesNamePlaceholder,
                      errorText: _nameError,
                      onChanged: (_) {
                        if (_nameError != null) {
                          setState(() => _nameError = null);
                        }
                      },
                    ),
                  ),
                  const shad.Gap(14),
                ],
                FinanceFormSection(
                  title: l10n.settingsWorkspaceRolesPermissionsSection,
                  child: Column(
                    children: [
                      for (
                        var groupIndex = 0;
                        groupIndex < workspacePermissionCatalog.length;
                        groupIndex++
                      ) ...[
                        _PermissionGroupCard(
                          title: workspacePermissionGroupLabel(
                            context,
                            workspacePermissionCatalog[groupIndex].id,
                          ),
                          children: workspacePermissionCatalog[groupIndex]
                              .permissions
                              .map(
                                (permissionId) => _PermissionToggleRow(
                                  label: workspacePermissionLabel(
                                    context,
                                    permissionId,
                                  ),
                                  value: _permissions[permissionId] ?? false,
                                  onChanged: (value) {
                                    setState(() {
                                      _permissions[permissionId] = value;
                                    });
                                  },
                                ),
                              )
                              .toList(growable: false),
                        ),
                        if (groupIndex != workspacePermissionCatalog.length - 1)
                          const shad.Gap(10),
                      ],
                    ],
                  ),
                ),
                if (!widget.forceDefault && widget.roleId != null) ...[
                  const shad.Gap(14),
                  FinanceFormSection(
                    title: l10n.settingsWorkspaceRolesMembersSection,
                    child: _availableMembers.isEmpty
                        ? Text(
                            l10n.settingsWorkspaceRolesMembersEmpty,
                            style: shad.Theme.of(context).typography.textSmall
                                .copyWith(
                                  color: shad.Theme.of(
                                    context,
                                  ).colorScheme.mutedForeground,
                                ),
                          )
                        : Column(
                            children: [
                              for (
                                var index = 0;
                                index < _availableMembers.length;
                                index++
                              ) ...[
                                _MemberAssignmentRow(
                                  member: _availableMembers[index],
                                  selected: _selectedMemberIds.contains(
                                    _availableMembers[index].id,
                                  ),
                                  onChanged: (selected) {
                                    setState(() {
                                      if (selected) {
                                        _selectedMemberIds.add(
                                          _availableMembers[index].id,
                                        );
                                      } else {
                                        _selectedMemberIds.remove(
                                          _availableMembers[index].id,
                                        );
                                      }
                                    });
                                  },
                                ),
                                if (index != _availableMembers.length - 1)
                                  const shad.Gap(10),
                              ],
                            ],
                          ),
                  ),
                ],
              ],
            ),
    );
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    final repository = context.read<WorkspaceManagementRepository>();

    try {
      final members = widget.forceDefault
          ? const <WorkspaceMemberListItem>[]
          : await repository.getMembers(widget.wsId);

      var detail = const WorkspaceRoleDetail(
        id: '',
        name: '',
        permissions: [],
      );
      var currentMemberIds = const <String>{};

      if (widget.forceDefault) {
        detail = await repository.getDefaultRole(widget.wsId);
      } else if (widget.roleId != null) {
        final results = await Future.wait<dynamic>([
          repository.getRole(widget.wsId, widget.roleId!),
          repository.getRoleMembers(widget.wsId, widget.roleId!),
        ]);
        detail = results[0] as WorkspaceRoleDetail;
        currentMemberIds = (results[1] as List<WorkspaceRoleMember>)
            .map((member) => member.id)
            .toSet();
      }

      _nameController.text = detail.name == 'DEFAULT' ? '' : detail.name;
      for (final permission in _permissions.keys) {
        _permissions[permission] = detail.permissions.any(
          (entry) => entry.id == permission && entry.enabled,
        );
      }

      _selectedMemberIds
        ..clear()
        ..addAll(currentMemberIds);

      if (!mounted) return;
      setState(() {
        _loading = false;
        _availableMembers = members.where((member) => !member.pending).toList();
        _currentMemberIds = currentMemberIds;
      });
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = error.message;
      });
    } on Exception catch (_) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = context.l10n.commonSomethingWentWrong;
      });
    }
  }

  Future<void> _save() async {
    final l10n = context.l10n;
    final name = _nameController.text.trim();
    if (!widget.forceDefault && name.isEmpty) {
      setState(() => _nameError = l10n.settingsWorkspaceRolesNameRequired);
      return;
    }

    setState(() => _saving = true);

    final repository = context.read<WorkspaceManagementRepository>();
    try {
      if (widget.forceDefault) {
        await repository.updateDefaultPermissions(
          wsId: widget.wsId,
          permissions: _permissions,
        );
      } else if (widget.roleId == null) {
        await repository.createRole(
          wsId: widget.wsId,
          name: name,
          permissions: _permissions,
        );
      } else {
        await repository.updateRole(
          wsId: widget.wsId,
          roleId: widget.roleId!,
          name: name,
          permissions: _permissions,
        );
        await repository.replaceRoleMembers(
          wsId: widget.wsId,
          roleId: widget.roleId!,
          currentMemberIds: _currentMemberIds,
          selectedMemberIds: _selectedMemberIds,
        );
      }

      if (!mounted) return;
      shad.showToast(
        context: context,
        builder: (_, overlay) =>
            shad.Alert(content: Text(l10n.settingsWorkspaceRolesSaved)),
      );
      Navigator.of(context).pop(true);
    } on ApiException catch (error) {
      if (!mounted) return;
      shad.showToast(
        context: context,
        builder: (_, overlay) =>
            shad.Alert.destructive(content: Text(error.message)),
      );
      setState(() => _saving = false);
    } on Exception catch (_) {
      if (!mounted) return;
      shad.showToast(
        context: context,
        builder: (_, overlay) => shad.Alert.destructive(
          content: Text(l10n.commonSomethingWentWrong),
        ),
      );
      setState(() => _saving = false);
    }
  }
}

class _RoleSummaryCard extends StatelessWidget {
  const _RoleSummaryCard({
    required this.title,
    this.subtitle,
    this.onTap,
    this.trailing,
  });

  final String title;
  final String? subtitle;
  final VoidCallback? onTap;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return FinancePanel(
      onTap: onTap,
      padding: const EdgeInsets.all(16),
      radius: 22,
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: shad.Theme.of(context).typography.small.copyWith(
                    fontWeight: FontWeight.w800,
                  ),
                ),
                if (subtitle?.trim().isNotEmpty ?? false) ...[
                  const shad.Gap(4),
                  Text(
                    subtitle!,
                    style: shad.Theme.of(context).typography.textSmall.copyWith(
                      color: shad.Theme.of(context).colorScheme.mutedForeground,
                    ),
                  ),
                ],
              ],
            ),
          ),
          const shad.Gap(12),
          trailing ??
              Icon(
                Icons.chevron_right_rounded,
                color: shad.Theme.of(context).colorScheme.mutedForeground,
              ),
        ],
      ),
    );
  }
}

class _PermissionGroupCard extends StatelessWidget {
  const _PermissionGroupCard({
    required this.title,
    required this.children,
  });

  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return FinancePanel(
      radius: 20,
      padding: const EdgeInsets.all(14),
      backgroundColor: FinancePalette.of(context).elevatedPanel,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: shad.Theme.of(context).typography.textSmall.copyWith(
              fontWeight: FontWeight.w800,
            ),
          ),
          const shad.Gap(10),
          ...children,
        ],
      ),
    );
  }
}

class _PermissionToggleRow extends StatelessWidget {
  const _PermissionToggleRow({
    required this.label,
    required this.value,
    required this.onChanged,
  });

  final String label;
  final bool value;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    return FinancePanel(
      radius: 16,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      child: Row(
        children: [
          Expanded(
            child: Text(
              label,
              style: shad.Theme.of(context).typography.textSmall.copyWith(
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
          const shad.Gap(12),
          shad.Switch(value: value, onChanged: onChanged),
        ],
      ),
    );
  }
}

class _MemberAssignmentRow extends StatelessWidget {
  const _MemberAssignmentRow({
    required this.member,
    required this.selected,
    required this.onChanged,
  });

  final WorkspaceMemberListItem member;
  final bool selected;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    return FinancePanel(
      radius: 16,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  member.label,
                  style: shad.Theme.of(context).typography.textSmall.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
                if (member.email != null && member.email != member.label) ...[
                  const shad.Gap(4),
                  Text(
                    member.email!,
                    style: shad.Theme.of(context).typography.xSmall.copyWith(
                      color: shad.Theme.of(context).colorScheme.mutedForeground,
                    ),
                  ),
                ],
              ],
            ),
          ),
          const shad.Gap(12),
          shad.Switch(value: selected, onChanged: onChanged),
        ],
      ),
    );
  }
}

class _FinanceStyleTextField extends StatelessWidget {
  const _FinanceStyleTextField({
    required this.controller,
    required this.placeholder,
    required this.onChanged,
    this.errorText,
  });

  final TextEditingController controller;
  final String placeholder;
  final ValueChanged<String> onChanged;
  final String? errorText;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        shad.TextField(
          controller: controller,
          placeholder: Text(placeholder),
          onChanged: onChanged,
        ),
        if (errorText != null) ...[
          const shad.Gap(6),
          Text(
            errorText!,
            style: shad.Theme.of(context).typography.xSmall.copyWith(
              color: shad.Theme.of(context).colorScheme.destructive,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ],
    );
  }
}

class _SettingsStatePanel extends StatelessWidget {
  const _SettingsStatePanel({
    required this.message,
    this.actionLabel,
    this.onPressed,
  });

  final String message;
  final String? actionLabel;
  final Future<void> Function()? onPressed;

  @override
  Widget build(BuildContext context) {
    return FinancePanel(
      padding: const EdgeInsets.all(20),
      child: Column(
        children: [
          Text(
            message,
            textAlign: TextAlign.center,
            style: shad.Theme.of(context).typography.textSmall.copyWith(
              color: shad.Theme.of(context).colorScheme.mutedForeground,
            ),
          ),
          if (actionLabel != null && onPressed != null) ...[
            const shad.Gap(14),
            shad.OutlineButton(
              onPressed: () => unawaited(onPressed!.call()),
              child: Text(actionLabel!),
            ),
          ],
        ],
      ),
    );
  }
}
