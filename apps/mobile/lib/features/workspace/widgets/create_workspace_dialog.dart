import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart' hide Chip, Divider;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:image_picker/image_picker.dart';
import 'package:mobile/core/input/platform_text_context_menu.dart';
import 'package:mobile/core/responsive/adaptive_sheet.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/app_dialog_scaffold.dart';
import 'package:mobile/widgets/image_source_picker_dialog.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

/// Shows a bottom sheet (compact) or dialog (medium+) for creating a new
/// workspace.
Future<void> showCreateWorkspaceDialog(BuildContext context) async {
  final workspaceCubit = context.read<WorkspaceCubit>();

  await showAdaptiveSheet<void>(
    context: context,
    builder: (context) {
      return BlocProvider<WorkspaceCubit>.value(
        value: workspaceCubit,
        child: const _CreateWorkspaceContent(),
      );
    },
  );
}

class _CreateWorkspaceContent extends StatefulWidget {
  const _CreateWorkspaceContent();

  @override
  State<_CreateWorkspaceContent> createState() =>
      _CreateWorkspaceContentState();
}

class _CreateWorkspaceContentState extends State<_CreateWorkspaceContent> {
  final _controller = TextEditingController();
  final _picker = ImagePicker();
  String? _error;
  File? _avatarFile;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _onSubmit() async {
    final name = _controller.text.trim();
    if (name.isEmpty) {
      setState(() => _error = context.l10n.workspaceCreateNameRequired);
      return;
    }

    setState(() => _error = null);

    try {
      final workspaceCubit = context.read<WorkspaceCubit>();
      final result = await workspaceCubit.createWorkspace(
        name,
        avatarFile: _avatarFile,
      );
      if (!mounted) return;

      final toastContext = Navigator.of(context, rootNavigator: true).context;
      if (!toastContext.mounted) return;

      shad.showToast(
        context: toastContext,
        builder: (context, overlay) => shad.Alert(
          content: Text(
            result.avatarUploadFailed
                ? context.l10n.workspaceCreateSuccessAvatarWarning
                : context.l10n.workspaceCreateSuccess,
          ),
        ),
      );

      // Auto-select the newly created workspace before dismissing.
      await workspaceCubit.selectWorkspace(result.workspace);
      if (!mounted) return;

      // Close dialog
      await Navigator.maybePop(context);
    } on ApiException catch (e) {
      if (!mounted) return;
      final toastContext = Navigator.of(context, rootNavigator: true).context;
      if (toastContext.mounted) {
        shad.showToast(
          context: toastContext,
          builder: (context, overlay) => shad.Alert.destructive(
            content: Text(
              e.message.isEmpty ? context.l10n.workspaceCreateError : e.message,
            ),
          ),
        );
      }
      setState(() => _error = e.message);
    } on Exception catch (e) {
      if (!mounted) return;
      final toastContext = Navigator.of(context, rootNavigator: true).context;
      if (toastContext.mounted) {
        shad.showToast(
          context: toastContext,
          builder: (context, overlay) => shad.Alert.destructive(
            content: Text(context.l10n.workspaceCreateError),
          ),
        );
      }
      setState(() => _error = e.toString());
    }
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

    if (!mounted || source == null) return;

    final picked = await _picker.pickImage(
      source: source,
      maxWidth: 1024,
      maxHeight: 1024,
      imageQuality: 85,
    );
    if (!mounted || picked == null) return;

    setState(() {
      _avatarFile = File(picked.path);
    });
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = shad.Theme.of(context);

    return BlocBuilder<WorkspaceCubit, WorkspaceState>(
      builder: (context, state) {
        final limits = state.limits;
        final canCreate = limits?.canCreate ?? true;

        return AppDialogScaffold(
          title: l10n.workspaceCreateTitle,
          description: l10n.workspaceCreateDescription,
          icon: Icons.add_business_outlined,
          maxWidth: 520,
          actions: [
            shad.OutlineButton(
              onPressed: state.isCreating
                  ? null
                  : () => Navigator.maybePop(context),
              child: Text(l10n.workspaceCreateCancel),
            ),
            shad.PrimaryButton(
              onPressed: (canCreate && !state.isCreating) ? _onSubmit : null,
              child: state.isCreating
                  ? const shad.CircularProgressIndicator(size: 16)
                  : Text(l10n.workspaceCreateSubmit),
            ),
          ],
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (limits != null && limits.limit > 0) ...[
                Text(
                  l10n.workspaceCreateLimitInfo(
                    limits.currentCount,
                    limits.limit,
                  ),
                  style: theme.typography.small.copyWith(
                    color: theme.colorScheme.mutedForeground,
                  ),
                ),
                const shad.Gap(8),
                shad.LinearProgressIndicator(
                  value: limits.currentCount / limits.limit,
                ),
                const shad.Gap(16),
              ],
              shad.TextField(
                contextMenuBuilder: platformTextContextMenuBuilder(),
                controller: _controller,
                placeholder: Text(l10n.workspaceCreateNameHint),
                enabled: canCreate && !state.isCreating,
                onSubmitted: (_) => _onSubmit(),
              ),
              const shad.Gap(12),
              Column(
                children: [
                  GestureDetector(
                    onTap: (canCreate && !state.isCreating)
                        ? _pickAvatar
                        : null,
                    child: CircleAvatar(
                      radius: 24,
                      backgroundImage: _avatarFile != null
                          ? FileImage(_avatarFile!)
                          : null,
                      child: _avatarFile == null
                          ? const Icon(Icons.business)
                          : null,
                    ),
                  ),
                  const shad.Gap(12),
                  if (_avatarFile != null)
                    Row(
                      children: [
                        Expanded(
                          child: shad.OutlineButton(
                            onPressed: (canCreate && !state.isCreating)
                                ? _pickAvatar
                                : null,
                            child: Text(l10n.profileUploadAvatar),
                          ),
                        ),
                        const shad.Gap(12),
                        Expanded(
                          child: shad.DestructiveButton(
                            onPressed: state.isCreating
                                ? null
                                : () => setState(() => _avatarFile = null),
                            child: Text(l10n.profileRemoveAvatar),
                          ),
                        ),
                      ],
                    )
                  else
                    Center(
                      child: shad.OutlineButton(
                        onPressed: (canCreate && !state.isCreating)
                            ? _pickAvatar
                            : null,
                        child: Text(l10n.profileUploadAvatar),
                      ),
                    ),
                ],
              ),
              if (_error != null) ...[
                const shad.Gap(8),
                Text(
                  _error!,
                  style: theme.typography.small.copyWith(
                    color: theme.colorScheme.destructive,
                  ),
                ),
              ],
              if (!canCreate) ...[
                const shad.Gap(8),
                Text(
                  l10n.workspaceCreateLimitReached,
                  style: theme.typography.small.copyWith(
                    color: theme.colorScheme.destructive,
                  ),
                ),
              ],
            ],
          ),
        );
      },
    );
  }
}
