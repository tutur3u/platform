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
import 'package:mobile/features/chat/widgets/chat_reply_quote.dart';
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
    this.replyTo,
    this.onCancelReply,
    this.onTypingChanged,
    this.onTypingStopped,
    super.key,
  });

  final List<ChatAttachment> pendingAttachments;
  final bool isSending;
  final bool isUploadingAttachment;
  final ValueChanged<String> onSend;
  final Future<void> Function(PlatformFile) onPickAttachment;
  final ValueChanged<String> onRemoveAttachment;

  /// Message being answered; shown above the field with a cancel control.
  final ChatMessage? replyTo;
  final VoidCallback? onCancelReply;

  /// Called with the field's text whenever it changes, to publish typing.
  final ValueChanged<String>? onTypingChanged;

  /// Called when the field loses focus, which ends the typing signal.
  final VoidCallback? onTypingStopped;

  @override
  State<ChatComposer> createState() => _ChatComposerState();
}

class _ChatComposerState extends State<ChatComposer> {
  final TextEditingController _controller = TextEditingController();
  final FocusNode _focus = FocusNode();
  bool _hasText = false;
  String _lastText = '';

  @override
  void initState() {
    super.initState();
    _controller.addListener(_syncHasText);
    _focus.addListener(_onFocusChanged);
  }

  @override
  void didUpdateWidget(covariant ChatComposer oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.replyTo != null && widget.replyTo?.id != oldWidget.replyTo?.id) {
      _focus.requestFocus();
    }
  }

  @override
  void dispose() {
    _controller
      ..removeListener(_syncHasText)
      ..dispose();
    _focus
      ..removeListener(_onFocusChanged)
      ..dispose();
    super.dispose();
  }

  void _onFocusChanged() {
    if (!_focus.hasFocus) widget.onTypingStopped?.call();
  }

  void _syncHasText() {
    // The controller also notifies on cursor moves; only text edits count.
    final text = _controller.text;
    if (text != _lastText) {
      _lastText = text;
      widget.onTypingChanged?.call(text);
    }
    final hasText = text.trim().isNotEmpty;
    if (hasText != _hasText) setState(() => _hasText = hasText);
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
    final canSend = !busy && (_hasText || widget.pendingAttachments.isNotEmpty);
    final replyTo = widget.replyTo;
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.md,
        AppSpacing.xs,
        AppSpacing.md,
        AppSpacing.sm,
      ),
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: colors.card,
          border: Border.all(color: colors.border),
          borderRadius: BorderRadius.circular(AppRadius.card - 4),
        ),
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.xs),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (replyTo != null)
                Padding(
                  padding: const EdgeInsets.only(bottom: AppSpacing.xs),
                  child: Row(
                    children: [
                      Expanded(
                        child: ChatReplyQuote(parent: replyTo, draft: true),
                      ),
                      AppIconButton(
                        tooltip: context.l10n.chatCancelReply,
                        size: AppButtonSize.small,
                        density: AppButtonDensity.iconDense,
                        icon: const Icon(LucideIcons.x, size: 16),
                        onPressed: widget.onCancelReply,
                      ),
                    ],
                  ),
                ),
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
                  focusNode: _focus,
                  borderless: true,
                  placeholder: context.l10n.chatMessagePlaceholder,
                  minLines: 1,
                  maxLines: 6,
                  enabled: !widget.isSending,
                  textInputAction: TextInputAction.send,
                  onSubmitted: (_) => _send(),
                ),
                trailing: [
                  AppIconButton(
                    tooltip: context.l10n.assistantSendAction,
                    variant: canSend
                        ? AppButtonVariant.primary
                        : AppButtonVariant.ghost,
                    shape: AppButtonShape.circle,
                    icon: widget.isSending
                        ? const AppLoadingIndicator.inline()
                        : const Icon(LucideIcons.arrowUp),
                    onPressed: canSend ? _send : null,
                  ),
                ],
              ),
            ],
          ),
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
