import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/workspace_management.dart';
import 'package:mobile/features/settings/view/workspace_admin_widgets.dart';
import 'package:mobile/l10n/l10n.dart';

/// Sheet with one validated text field that submits through [onSubmit].
/// Resolves `true` once [onSubmit] completes.
Future<bool> showWorkspaceFieldSheet({
  required BuildContext context,
  required String title,
  required String label,
  required String placeholder,
  required String submitLabel,
  required String? Function(String value) validate,
  required Future<void> Function(String value) onSubmit,
  TextInputType? keyboardType,
  IconData? icon,
}) async {
  final done = await showAppSheet<bool>(
    context: context,
    builder: (_) => _WorkspaceFieldSheet(
      title: title,
      label: label,
      placeholder: placeholder,
      submitLabel: submitLabel,
      validate: validate,
      onSubmit: onSubmit,
      keyboardType: keyboardType,
      icon: icon,
    ),
  );
  return done ?? false;
}

class _WorkspaceFieldSheet extends StatefulWidget {
  const _WorkspaceFieldSheet({
    required this.title,
    required this.label,
    required this.placeholder,
    required this.submitLabel,
    required this.validate,
    required this.onSubmit,
    this.keyboardType,
    this.icon,
  });

  final String title;
  final String label;
  final String placeholder;
  final String submitLabel;
  final String? Function(String value) validate;
  final Future<void> Function(String value) onSubmit;
  final TextInputType? keyboardType;
  final IconData? icon;

  @override
  State<_WorkspaceFieldSheet> createState() => _WorkspaceFieldSheetState();
}

class _WorkspaceFieldSheetState extends State<_WorkspaceFieldSheet> {
  final _controller = TextEditingController();
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final value = _controller.text.trim();
    final invalid = widget.validate(value);
    if (invalid != null) {
      setState(() => _error = invalid);
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await widget.onSubmit(value);
      if (mounted) Navigator.of(context).pop(true);
    } on Object catch (error) {
      if (!mounted) return;
      setState(() {
        _saving = false;
        _error = describeWorkspaceAdminError(context, error);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return AppSheetScaffold(
      title: widget.title,
      icon: widget.icon,
      actions: [
        AppButton.ghost(
          onPressed: _saving ? null : () => Navigator.of(context).pop(false),
          child: Text(context.l10n.commonCancel),
        ),
        AppButton.primary(
          key: const ValueKey('workspace-field-sheet-submit'),
          loading: _saving,
          onPressed: _saving ? null : () => unawaited(_submit()),
          child: Text(widget.submitLabel),
        ),
      ],
      child: AppTextField(
        controller: _controller,
        label: widget.label,
        placeholder: widget.placeholder,
        errorText: _error,
        keyboardType: widget.keyboardType,
        autofocus: true,
        enabled: !_saving,
        textInputAction: TextInputAction.done,
        onChanged: (_) {
          if (_error != null) setState(() => _error = null);
        },
        onSubmitted: (_) => unawaited(_submit()),
      ),
    );
  }
}

/// What the member sheet asked the page to do next.
enum WorkspaceMemberSheetResult { rolesSaved, remove }

/// Member details with role assignment for role managers and a removal
/// action for member managers.
class WorkspaceMemberSheet extends StatefulWidget {
  const WorkspaceMemberSheet({
    required this.member,
    required this.roles,
    required this.canEditRoles,
    required this.canRemove,
    required this.onSaveRoles,
    super.key,
  });

  final WorkspaceMemberListItem member;
  final List<WorkspaceRoleListItem> roles;
  final bool canEditRoles;
  final bool canRemove;
  final Future<void> Function(Set<String> current, Set<String> selected)
  onSaveRoles;

  @override
  State<WorkspaceMemberSheet> createState() => _WorkspaceMemberSheetState();
}

class _WorkspaceMemberSheetState extends State<WorkspaceMemberSheet> {
  late final Set<String> _current = {
    for (final role in widget.member.roles) role.id,
  };
  late final Set<String> _selected = {..._current};
  bool _saving = false;
  String? _error;

  bool get _dirty =>
      _selected.length != _current.length || !_selected.containsAll(_current);

  Future<void> _save() async {
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await widget.onSaveRoles(_current, _selected);
      if (mounted) {
        Navigator.of(context).pop(WorkspaceMemberSheetResult.rolesSaved);
      }
    } on Object catch (error) {
      if (!mounted) return;
      setState(() {
        _saving = false;
        _error = describeWorkspaceAdminError(context, error);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final member = widget.member;
    final email = member.email;
    final roleNames = member.roles.map((role) => role.name).toList();
    return AppSheetScaffold(
      title: member.label,
      description: email != null && email != member.label ? email : null,
      actions: [
        if (widget.canRemove)
          AppButton.ghost(
            key: const ValueKey('workspace-member-remove'),
            onPressed: _saving
                ? null
                : () => Navigator.of(
                    context,
                  ).pop(WorkspaceMemberSheetResult.remove),
            leading: const Icon(LucideIcons.userMinus),
            child: Text(l10n.settingsWorkspaceMembersRemoveTitle),
          ),
        if (widget.canEditRoles)
          AppButton.primary(
            key: const ValueKey('workspace-member-save-roles'),
            loading: _saving,
            onPressed: _saving || !_dirty ? null : () => unawaited(_save()),
            child: Text(l10n.commonSave),
          ),
      ],
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          if ((!widget.canEditRoles || widget.roles.isEmpty) &&
              roleNames.isEmpty &&
              !member.isCreator)
            Text(l10n.settingsWorkspaceMembersNoRoles)
          else if (!widget.canEditRoles || widget.roles.isEmpty)
            WorkspaceRoleBadges(
              roles: roleNames,
              owner: member.isCreator,
              maxVisible: roleNames.length,
            )
          else
            AppGroupedSection(
              caption: l10n.settingsWorkspaceMembersRolesSection,
              dividerInset: AppLayout.rowHorizontalPadding,
              children: [
                for (final role in widget.roles)
                  AppCheckboxRow(
                    key: ValueKey('workspace-member-role-${role.id}'),
                    padding: const EdgeInsets.symmetric(
                      horizontal: AppLayout.rowHorizontalPadding,
                      vertical: AppSpacing.xs,
                    ),
                    title: Text(role.name),
                    value: _selected.contains(role.id),
                    onChanged: _saving
                        ? null
                        : (value) => setState(() {
                            if (value ?? false) {
                              _selected.add(role.id);
                            } else {
                              _selected.remove(role.id);
                            }
                          }),
                  ),
              ],
            ),
          if (_error case final error?) ...[
            const SizedBox(height: AppSpacing.md),
            AppAlert.destructive(content: Text(error)),
          ],
        ],
      ),
    );
  }
}
