import 'dart:io';

import 'package:flutter/material.dart' hide Divider;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:image_picker/image_picker.dart';
import 'package:mobile/core/responsive/adaptive_sheet.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/workspace_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/app_dialog_scaffold.dart';
import 'package:mobile/widgets/image_source_picker_dialog.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

Future<void> showWorkspacePropertiesDialog(
  BuildContext context, {
  required Workspace workspace,
}) {
  return showAdaptiveSheet<void>(
    context: context,
    builder: (dialogContext) {
      return _WorkspacePropertiesDialog(workspace: workspace);
    },
  );
}

class _WorkspacePropertiesDialog extends StatefulWidget {
  const _WorkspacePropertiesDialog({required this.workspace});

  final Workspace workspace;

  @override
  State<_WorkspacePropertiesDialog> createState() =>
      _WorkspacePropertiesDialogState();
}

class _WorkspacePropertiesDialogState
    extends State<_WorkspacePropertiesDialog> {
  final _picker = ImagePicker();
  late final TextEditingController _nameController;
  final WorkspaceRepository _workspaceRepository = WorkspaceRepository();

  File? _avatarFile;
  bool _removeAvatar = false;
  bool _isSaving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _nameController = TextEditingController(text: widget.workspace.name ?? '');
  }

  @override
  void dispose() {
    _nameController.dispose();
    super.dispose();
  }

  bool get _hadInitialAvatar =>
      widget.workspace.avatarUrl?.trim().isNotEmpty ?? false;

  bool get _hasChanges {
    final initialName = (widget.workspace.name ?? '').trim();
    final updatedName = _nameController.text.trim();
    return initialName != updatedName || _avatarFile != null || _removeAvatar;
  }

  Future<void> _pickAvatar() async {
    final l10n = context.l10n;

    final source = await showImageSourcePickerDialog(
      context: context,
      title: l10n.selectImageSource,
      description: l10n.profileAvatarPickerDescription,
      cameraLabel: l10n.camera,
      galleryLabel: l10n.gallery,
    );

    if (!mounted || source == null) {
      return;
    }

    final picked = await _picker.pickImage(
      source: source,
      maxWidth: 1024,
      maxHeight: 1024,
      imageQuality: 85,
    );
    if (!mounted || picked == null) {
      return;
    }

    setState(() {
      _avatarFile = File(picked.path);
      _removeAvatar = false;
    });
  }

  Future<void> _onSave() async {
    final name = _nameController.text.trim();
    if (name.isEmpty) {
      setState(() {
        _error = context.l10n.settingsWorkspacePropertiesNameRequired;
      });
      return;
    }

    if (!_hasChanges) {
      await Navigator.maybePop(context);
      return;
    }

    setState(() {
      _error = null;
      _isSaving = true;
    });

    final toastContext = Navigator.of(context, rootNavigator: true).context;
    final workspaceCubit = context.read<WorkspaceCubit>();
    final initialName = (widget.workspace.name ?? '').trim();

    try {
      if (name != initialName) {
        await _workspaceRepository.updateWorkspaceName(
          widget.workspace.id,
          name,
        );
      }

      if (_avatarFile != null) {
        await _workspaceRepository.updateWorkspaceAvatar(
          widget.workspace.id,
          _avatarFile!,
        );
      } else if (_removeAvatar && _hadInitialAvatar) {
        await _workspaceRepository.removeWorkspaceAvatar(widget.workspace.id);
      }

      await workspaceCubit.loadWorkspaces();

      if (!mounted) {
        return;
      }

      if (toastContext.mounted) {
        shad.showToast(
          context: toastContext,
          builder: (context, overlay) => shad.Alert(
            content: Text(context.l10n.settingsWorkspacePropertiesUpdated),
          ),
        );
      }

      await Navigator.maybePop(context);
    } on ApiException catch (e) {
      if (!mounted) {
        return;
      }

      final message = e.message.isNotEmpty
          ? e.message
          : context.l10n.commonSomethingWentWrong;

      setState(() {
        _error = message;
      });

      if (toastContext.mounted) {
        shad.showToast(
          context: toastContext,
          builder: (context, overlay) => shad.Alert.destructive(
            title: Text(context.l10n.commonSomethingWentWrong),
            content: Text(message),
          ),
        );
      }
    } on Exception {
      if (!mounted) {
        return;
      }

      setState(() {
        _error = context.l10n.commonSomethingWentWrong;
      });

      if (toastContext.mounted) {
        shad.showToast(
          context: toastContext,
          builder: (context, overlay) => shad.Alert.destructive(
            title: Text(context.l10n.commonSomethingWentWrong),
            content: Text(context.l10n.commonSomethingWentWrong),
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() {
          _isSaving = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = shad.Theme.of(context);

    final initialsSource = _nameController.text.trim().isNotEmpty
        ? _nameController.text.trim()
        : (widget.workspace.name ?? '?');
    final initials = initialsSource.isNotEmpty
        ? initialsSource[0].toUpperCase()
        : '?';

    final hasAvatarPreview =
        !_removeAvatar &&
        (_avatarFile != null ||
            (widget.workspace.avatarUrl?.isNotEmpty ?? false));

    ImageProvider<Object>? avatarImage;
    if (!_removeAvatar && _avatarFile != null) {
      avatarImage = FileImage(_avatarFile!);
    } else if (!_removeAvatar &&
        (widget.workspace.avatarUrl?.isNotEmpty ?? false)) {
      avatarImage = NetworkImage(widget.workspace.avatarUrl!);
    }

    return AppDialogScaffold(
      title: l10n.settingsWorkspacePropertiesTitle,
      description: l10n.settingsWorkspacePropertiesDescription,
      icon: Icons.business_center_outlined,
      maxWidth: 520,
      actions: [
        shad.OutlineButton(
          onPressed: _isSaving ? null : () => Navigator.maybePop(context),
          child: Text(l10n.commonCancel),
        ),
        shad.PrimaryButton(
          onPressed: _isSaving ? null : _onSave,
          child: _isSaving
              ? const shad.CircularProgressIndicator(size: 16)
              : Text(l10n.profileSave),
        ),
      ],
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              GestureDetector(
                onTap: _isSaving ? null : _pickAvatar,
                child: CircleAvatar(
                  radius: 28,
                  backgroundImage: avatarImage,
                  child: hasAvatarPreview
                      ? null
                      : Text(
                          initials,
                          style: theme.typography.large.copyWith(
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                  ),
                ),
              
            ],
          ),
          const shad.Gap(12),
          Row(
            children: [
              Expanded(
                child: shad.OutlineButton(
                  onPressed: _isSaving ? null : _pickAvatar,
                  child: Text(l10n.profileUploadAvatar),
                ),
              ),
              if (_avatarFile != null || _hadInitialAvatar) ...[
                const shad.Gap(12),
                Expanded(
                  child: shad.DestructiveButton(
                    onPressed: _isSaving
                        ? null
                        : () {
                            setState(() {
                              _avatarFile = null;
                              _removeAvatar = true;
                            });
                          },
                    child: Text(l10n.profileRemoveAvatar),
                  ),
                ),
              ],
            ],
          ),
          if (_removeAvatar) ...[
            const shad.Gap(8),
            Text(
              l10n.settingsWorkspaceAvatarRemovePending,
              style: theme.typography.textSmall.copyWith(
                color: theme.colorScheme.mutedForeground,
              ),
            ),
          ],
          const shad.Gap(16),
          shad.TextField(
            controller: _nameController,
            enabled: !_isSaving,
            placeholder: Text(l10n.settingsWorkspaceNameHint),
          ),
          if (_error?.trim().isNotEmpty ?? false) ...[
            const shad.Gap(8),
            Text(
              _error!,
              style: theme.typography.small.copyWith(
                color: theme.colorScheme.destructive,
              ),
            ),
          ],
        ],
      ),
    );
  }
}
