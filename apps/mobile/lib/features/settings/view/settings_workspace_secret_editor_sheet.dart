import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/l10n/l10n.dart';

/// Creates or edits one workspace secret. The value starts hidden when it
/// already holds something, and resolves `true` once [onSubmit] completes.
Future<bool> showWorkspaceSecretEditor({
  required BuildContext context,
  required String title,
  required String initialName,
  required String initialValue,
  required Future<void> Function(String name, String value) onSubmit,
  bool nameLocked = false,
}) async {
  final saved = await showAppSheet<bool>(
    context: context,
    builder: (_) => WorkspaceSecretEditorSheet(
      title: title,
      initialName: initialName,
      initialValue: initialValue,
      nameLocked: nameLocked,
      onSubmit: onSubmit,
    ),
  );
  return saved ?? false;
}

class WorkspaceSecretEditorSheet extends StatefulWidget {
  const WorkspaceSecretEditorSheet({
    required this.title,
    required this.initialName,
    required this.initialValue,
    required this.onSubmit,
    this.nameLocked = false,
    super.key,
  });

  final String title;
  final String initialName;
  final String initialValue;
  final bool nameLocked;
  final Future<void> Function(String name, String value) onSubmit;

  @override
  State<WorkspaceSecretEditorSheet> createState() =>
      _WorkspaceSecretEditorSheetState();
}

class _WorkspaceSecretEditorSheetState
    extends State<WorkspaceSecretEditorSheet> {
  late final _nameController = TextEditingController(text: widget.initialName);
  late final _valueController = TextEditingController(
    text: widget.initialValue,
  );
  late bool _hidden = widget.initialValue.isNotEmpty;
  bool _saving = false;
  String? _nameError;
  String? _valueError;
  String? _submitError;

  @override
  void dispose() {
    _nameController.dispose();
    _valueController.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final l10n = context.l10n;
    final name = _nameController.text.trim();
    final value = _valueController.text.trim();
    setState(() {
      _nameError = name.isEmpty
          ? l10n.settingsWorkspaceSecretsNameRequired
          : null;
      _valueError = value.isEmpty
          ? l10n.settingsWorkspaceSecretsValueRequired
          : null;
      _submitError = null;
    });
    if (_nameError != null || _valueError != null) return;
    setState(() => _saving = true);
    try {
      await widget.onSubmit(name, value);
      if (mounted) Navigator.of(context).pop(true);
    } on Exception catch (error) {
      if (!mounted) return;
      setState(() {
        _saving = false;
        _submitError = error is ApiException && error.message.trim().isNotEmpty
            ? error.message.trim()
            : l10n.settingsWorkspaceSecretsSaveError;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return AppSheetScaffold(
      title: widget.title,
      icon: LucideIcons.keyRound,
      actions: [
        AppButton.ghost(
          onPressed: _saving ? null : () => Navigator.of(context).pop(false),
          child: Text(l10n.commonCancel),
        ),
        AppButton.primary(
          key: const ValueKey('workspace-secret-save'),
          loading: _saving,
          onPressed: _saving ? null : () => unawaited(_save()),
          child: Text(l10n.settingsWorkspaceSecretsSave),
        ),
      ],
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          AppTextField(
            key: const ValueKey('workspace-secret-name'),
            controller: _nameController,
            label: l10n.settingsWorkspaceSecretsNameField,
            placeholder: l10n.settingsWorkspaceSecretsNamePlaceholder,
            errorText: _nameError,
            readOnly: widget.nameLocked,
            enabled: !_saving,
            textCapitalization: TextCapitalization.characters,
            style: const TextStyle(fontFamily: 'monospace'),
          ),
          const SizedBox(height: AppSpacing.lg),
          AppTextField(
            key: const ValueKey('workspace-secret-value'),
            controller: _valueController,
            label: l10n.settingsWorkspaceSecretsValueField,
            placeholder: l10n.settingsWorkspaceSecretsValuePlaceholder,
            errorText: _valueError,
            enabled: !_saving,
            obscureText: _hidden,
            maxLines: _hidden ? 1 : 4,
            minLines: 1,
            style: const TextStyle(fontFamily: 'monospace'),
            trailing: AppIconButton(
              key: const ValueKey('workspace-secret-value-visibility'),
              tooltip: _hidden
                  ? l10n.settingsWorkspaceSecretsReveal
                  : l10n.settingsWorkspaceSecretsHide,
              icon: Icon(_hidden ? LucideIcons.eye : LucideIcons.eyeOff),
              onPressed: () => setState(() => _hidden = !_hidden),
            ),
          ),
          if (_submitError case final error?) ...[
            const SizedBox(height: AppSpacing.md),
            AppAlert.destructive(content: Text(error)),
          ],
        ],
      ),
    );
  }
}
