import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/workspace_management.dart';
import 'package:mobile/data/repositories/workspace_management_repository.dart';
import 'package:mobile/features/settings/view/workspace_admin_widgets.dart';
import 'package:mobile/features/settings/view/workspace_role_permission_catalog.dart';
import 'package:mobile/l10n/l10n.dart';

/// What the role editor asked the page to do next.
enum WorkspaceRoleEditorResult { saved, delete }

/// Opens the role editor: the default access when [forceDefault], a new role
/// when [roleId] is null, or an existing role with its members.
Future<WorkspaceRoleEditorResult?> showWorkspaceRoleEditor({
  required BuildContext context,
  required WorkspaceManagementRepository repository,
  required String wsId,
  String? roleId,
  bool forceDefault = false,
}) => showAppSheet<WorkspaceRoleEditorResult>(
  context: context,
  size: AppSheetSize.full,
  builder: (_) => WorkspaceRoleEditorSheet(
    repository: repository,
    wsId: wsId,
    roleId: roleId,
    forceDefault: forceDefault,
  ),
);

/// Role name, permission matrix and member assignment.
class WorkspaceRoleEditorSheet extends StatefulWidget {
  const WorkspaceRoleEditorSheet({
    required this.repository,
    required this.wsId,
    this.roleId,
    this.forceDefault = false,
    super.key,
  });

  final WorkspaceManagementRepository repository;
  final String wsId;
  final String? roleId;
  final bool forceDefault;

  @override
  State<WorkspaceRoleEditorSheet> createState() =>
      _WorkspaceRoleEditorSheetState();
}

class _WorkspaceRoleEditorSheetState extends State<WorkspaceRoleEditorSheet> {
  final _nameController = TextEditingController();
  final Map<String, bool> _permissions = {
    for (final group in workspacePermissionCatalog)
      for (final permission in group.permissions) permission: false,
  };
  final Set<String> _selectedMemberIds = {};
  Set<String> _currentMemberIds = const {};
  List<WorkspaceMemberListItem> _members = const [];

  bool _loading = true;
  bool _saving = false;
  String? _loadError;
  String? _saveError;
  String? _nameError;

  bool get _isNewRole => widget.roleId == null && !widget.forceDefault;
  bool get _isExistingRole => widget.roleId != null && !widget.forceDefault;

  @override
  void initState() {
    super.initState();
    unawaited(_load());
  }

  @override
  void dispose() {
    _nameController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _loadError = null;
    });
    final repository = widget.repository;
    try {
      var detail = const WorkspaceRoleDetail(id: '', name: '', permissions: []);
      var members = const <WorkspaceMemberListItem>[];
      var currentMemberIds = const <String>{};
      if (widget.forceDefault) {
        detail = await repository.getDefaultRole(widget.wsId);
      } else if (widget.roleId case final roleId?) {
        final results = await Future.wait<Object>([
          repository.getRole(widget.wsId, roleId),
          repository.getRoleMembers(widget.wsId, roleId),
          repository.getMembers(widget.wsId),
        ]);
        detail = results[0] as WorkspaceRoleDetail;
        currentMemberIds = (results[1] as List<WorkspaceRoleMember>)
            .map((member) => member.id)
            .toSet();
        members = (results[2] as List<WorkspaceMemberListItem>)
            .where((member) => !member.pending)
            .toList(growable: false);
      }
      if (!mounted) return;
      _nameController.text = detail.name == 'DEFAULT' ? '' : detail.name;
      setState(() {
        for (final permission in _permissions.keys) {
          _permissions[permission] = detail.permissions.any(
            (entry) => entry.id == permission && entry.enabled,
          );
        }
        _currentMemberIds = currentMemberIds;
        _selectedMemberIds
          ..clear()
          ..addAll(currentMemberIds);
        _members = members;
        _loading = false;
      });
    } on Exception catch (error) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _loadError = describeWorkspaceAdminError(context, error);
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
    setState(() {
      _saving = true;
      _saveError = null;
    });
    final repository = widget.repository;
    try {
      if (widget.forceDefault) {
        await repository.updateDefaultPermissions(
          wsId: widget.wsId,
          permissions: _permissions,
        );
      } else if (widget.roleId case final roleId?) {
        await repository.updateRole(
          wsId: widget.wsId,
          roleId: roleId,
          name: name,
          permissions: _permissions,
        );
        await repository.replaceRoleMembers(
          wsId: widget.wsId,
          roleId: roleId,
          currentMemberIds: _currentMemberIds,
          selectedMemberIds: _selectedMemberIds,
        );
      } else {
        await repository.createRole(
          wsId: widget.wsId,
          name: name,
          permissions: _permissions,
        );
      }
      if (mounted) Navigator.of(context).pop(WorkspaceRoleEditorResult.saved);
    } on Exception catch (error) {
      if (!mounted) return;
      setState(() {
        _saving = false;
        _saveError = describeWorkspaceAdminError(context, error);
      });
    }
  }

  void _setGroup(WorkspacePermissionGroupCatalog group, bool enabled) {
    setState(() {
      for (final permission in group.permissions) {
        _permissions[permission] = enabled;
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final title = widget.forceDefault
        ? l10n.settingsWorkspaceRolesDefaultTitle
        : _isNewRole
        ? l10n.settingsWorkspaceRolesCreate
        : l10n.settingsWorkspaceRolesEdit;
    final enabledCount = _permissions.values.where((value) => value).length;
    return AppSheetScaffold(
      title: title,
      description: _loading || _loadError != null
          ? null
          : l10n.settingsWorkspaceRolesPermissionCount(enabledCount),
      icon: widget.forceDefault ? LucideIcons.shield : LucideIcons.userCog,
      actions: [
        if (_isExistingRole)
          AppButton.ghost(
            key: const ValueKey('workspace-role-delete'),
            onPressed: _saving
                ? null
                : () => Navigator.of(
                    context,
                  ).pop(WorkspaceRoleEditorResult.delete),
            leading: const Icon(LucideIcons.trash2),
            child: Text(l10n.settingsWorkspaceRolesDeleteTitle),
          ),
        AppButton.primary(
          key: const ValueKey('workspace-role-save'),
          loading: _saving,
          onPressed: _saving || _loading || _loadError != null
              ? null
              : () => unawaited(_save()),
          child: Text(
            _isNewRole
                ? l10n.settingsWorkspaceRolesCreate
                : l10n.settingsWorkspaceRolesSave,
          ),
        ),
      ],
      child: _body(context),
    );
  }

  Widget _body(BuildContext context) {
    final l10n = context.l10n;
    if (_loading) return const AppSkeletonRows(count: 5);
    if (_loadError case final error?) {
      return AppStateMessage.inline(
        icon: LucideIcons.circleAlert,
        tone: AppTone.destructive,
        title: l10n.commonSomethingWentWrong,
        message: error,
        actionLabel: l10n.commonRetry,
        onAction: () => unawaited(_load()),
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (!widget.forceDefault) ...[
          AppTextField(
            key: const ValueKey('workspace-role-name'),
            controller: _nameController,
            label: l10n.settingsWorkspaceRolesNameField,
            placeholder: l10n.settingsWorkspaceRolesNamePlaceholder,
            errorText: _nameError,
            enabled: !_saving,
            textCapitalization: TextCapitalization.words,
            onChanged: (_) {
              if (_nameError != null) setState(() => _nameError = null);
            },
          ),
          const SizedBox(height: AppLayout.sectionGap),
        ],
        if (_saveError case final error?) ...[
          AppAlert.destructive(content: Text(error)),
          const SizedBox(height: AppLayout.sectionGap),
        ],
        if (_permissions['admin'] ?? false) ...[
          AppAlert(
            variant: AppAlertVariant.info,
            leading: const Icon(LucideIcons.shieldCheck),
            content: Text(l10n.settingsWorkspaceRolesAdminNote),
          ),
          const SizedBox(height: AppLayout.sectionGap),
        ],
        for (final group in workspacePermissionCatalog)
          _PermissionGroupSection(
            group: group,
            permissions: _permissions,
            enabled: !_saving,
            onChanged: (permission, value) =>
                setState(() => _permissions[permission] = value),
            onSetAll: (value) => _setGroup(group, value),
          ),
        if (_isExistingRole)
          AppGroupedSection(
            caption: l10n.settingsWorkspaceRolesMembersSection,
            dividerInset: AppLayout.rowHorizontalPadding,
            children: _members.isEmpty
                ? [
                    AppStateMessage.inline(
                      icon: LucideIcons.users,
                      title: l10n.settingsWorkspaceRolesMembersEmpty,
                    ),
                  ]
                : [
                    for (final member in _members)
                      AppCheckboxRow(
                        key: ValueKey('workspace-role-member-${member.id}'),
                        padding: _rowPadding,
                        title: Text(member.label),
                        subtitle:
                            member.email == null || member.email == member.label
                            ? null
                            : Text(member.email!),
                        value: _selectedMemberIds.contains(member.id),
                        onChanged: _saving
                            ? null
                            : (value) => setState(() {
                                if (value ?? false) {
                                  _selectedMemberIds.add(member.id);
                                } else {
                                  _selectedMemberIds.remove(member.id);
                                }
                              }),
                      ),
                  ],
          ),
      ],
    );
  }
}

const _rowPadding = EdgeInsets.symmetric(
  horizontal: AppLayout.rowHorizontalPadding,
  vertical: AppSpacing.sm,
);

/// One permission group of the matrix with a select-all control.
class _PermissionGroupSection extends StatelessWidget {
  const _PermissionGroupSection({
    required this.group,
    required this.permissions,
    required this.enabled,
    required this.onChanged,
    required this.onSetAll,
  });

  final WorkspacePermissionGroupCatalog group;
  final Map<String, bool> permissions;
  final bool enabled;
  final void Function(String permission, bool value) onChanged;
  final ValueChanged<bool> onSetAll;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final allOn = group.permissions.every(
      (permission) => permissions[permission] ?? false,
    );
    return AppGroupedSection.spaced(
      caption: workspacePermissionGroupLabel(context, group.id),
      dividerInset: AppLayout.rowHorizontalPadding,
      captionTrailing: group.permissions.length < 2
          ? null
          : AppButton(
              key: ValueKey('workspace-role-group-${group.id}'),
              variant: AppButtonVariant.link,
              density: AppButtonDensity.compact,
              onPressed: enabled ? () => onSetAll(!allOn) : null,
              child: Text(
                allOn
                    ? l10n.settingsWorkspaceRolesClearGroup
                    : l10n.settingsWorkspaceRolesSelectGroup,
              ),
            ),
      children: [
        for (final permission in group.permissions)
          AppToggleRow(
            key: ValueKey('workspace-role-permission-$permission'),
            padding: _rowPadding,
            title: Text(workspacePermissionLabel(context, permission)),
            value: permissions[permission] ?? false,
            onChanged: enabled ? (value) => onChanged(permission, value) : null,
          ),
      ],
    );
  }
}
