import 'dart:async';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:image_picker/image_picker.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/core/utils/gallery_platform_file.dart';
import 'package:mobile/features/chat/cubit/chat_cubit.dart';
import 'package:mobile/features/chat/models/chat_models.dart';
import 'package:mobile/features/chat/widgets/chat_attachment_preview.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/pending_sync_frame.dart';

class ChatComposer extends StatefulWidget {
  const ChatComposer({
    required this.pendingAttachments,
    required this.isSending,
    required this.isUploadingAttachment,
    required this.onSend,
    required this.onPickAttachment,
    required this.onRemoveAttachment,
    super.key,
  });

  final List<ChatAttachment> pendingAttachments;
  final bool isSending;
  final bool isUploadingAttachment;
  final ValueChanged<String> onSend;
  final Future<void> Function(PlatformFile) onPickAttachment;
  final ValueChanged<String> onRemoveAttachment;

  @override
  State<ChatComposer> createState() => _ChatComposerState();
}

class _ChatComposerState extends State<ChatComposer> {
  final TextEditingController _controller = TextEditingController();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _pickAttachment() async {
    final file = await FilePicker.pickFile();
    if (file != null) {
      await widget.onPickAttachment(file);
    }
  }

  Future<void> _pickGalleryMedia() async {
    try {
      final media = await ImagePicker().pickMultipleMedia();
      for (final item in media) {
        await widget.onPickAttachment(GalleryPlatformFile(item));
      }
    } on Exception {
      if (!mounted) return;
      showAppToast(
        context,
        message: context.l10n.assistantGalleryPickError,
        variant: AppAlertVariant.destructive,
      );
    }
  }

  Future<void> _showAttachmentOptions() async {
    final l10n = context.l10n;
    await showAppSheet<void>(
      context: context,
      builder: (sheetContext) => AppSheetScaffold(
        title: l10n.chatAttach,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            AppButton.ghost(
              leading: const Icon(LucideIcons.paperclip),
              onPressed: () {
                Navigator.of(sheetContext).pop();
                unawaited(_pickAttachment());
              },
              child: Text(l10n.assistantAttachFilesAction),
            ),
            AppButton.ghost(
              leading: const Icon(LucideIcons.image),
              onPressed: () {
                Navigator.of(sheetContext).pop();
                unawaited(_pickGalleryMedia());
              },
              child: Text(l10n.assistantAttachGalleryMediaAction),
            ),
          ],
        ),
      ),
    );
  }

  void _send() {
    if (widget.isSending || widget.isUploadingAttachment) return;
    final text = _controller.text.trim();
    if (text.isEmpty && widget.pendingAttachments.isEmpty) return;
    widget.onSend(text);
    _controller.clear();
  }

  @override
  Widget build(BuildContext context) {
    final colors = AppTokens.of(context).colorScheme;
    final busy = widget.isSending || widget.isUploadingAttachment;
    return DecoratedBox(
      decoration: BoxDecoration(
        color: colors.card,
        border: Border(top: BorderSide(color: colors.border)),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.md,
          vertical: AppSpacing.sm,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (widget.pendingAttachments.isNotEmpty)
              _PendingAttachmentStrip(
                attachments: widget.pendingAttachments,
                onRemove: widget.onRemoveAttachment,
              ),
            AppComposerRow(
              minHeight: AppLayout.rowMinHeight,
              leading: [
                AppIconButton(
                  tooltip: context.l10n.chatAttach,
                  icon: widget.isUploadingAttachment
                      ? const AppLoadingIndicator.inline()
                      : const Icon(LucideIcons.paperclip),
                  onPressed: busy
                      ? null
                      : () => unawaited(_showAttachmentOptions()),
                ),
              ],
              field: AppTextField(
                controller: _controller,
                filled: true,
                borderless: true,
                placeholder: context.l10n.chatMessagePlaceholder,
                minLines: 1,
                maxLines: 5,
                enabled: !widget.isSending,
                textInputAction: TextInputAction.send,
                onSubmitted: (_) => _send(),
              ),
              trailing: [
                AppIconButton(
                  tooltip: context.l10n.assistantSendAction,
                  variant: AppButtonVariant.primary,
                  icon: widget.isSending
                      ? const AppLoadingIndicator.inline()
                      : const Icon(LucideIcons.send),
                  onPressed: busy ? null : _send,
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _PendingAttachmentStrip extends StatelessWidget {
  const _PendingAttachmentStrip({
    required this.attachments,
    required this.onRemove,
  });

  final List<ChatAttachment> attachments;
  final ValueChanged<String> onRemove;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.sm),
      child: Wrap(
        spacing: AppSpacing.sm,
        runSpacing: AppSpacing.sm,
        children: attachments
            .map(
              (attachment) => PendingSyncFrame(
                workspaceId: context.read<ChatCubit>().state.wsId ?? '',
                feature: 'chat',
                entityId: attachment.id,
                child: ChatAttachmentPreview(
                  key: ValueKey(attachment.id),
                  attachment: attachment,
                  compact: true,
                  onRemove: () => onRemove(attachment.id),
                ),
              ),
            )
            .toList(growable: false),
      ),
    );
  }
}
