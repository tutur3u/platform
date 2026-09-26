import 'dart:async';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:mobile/core/input/platform_text_context_menu.dart';
import 'package:mobile/core/utils/gallery_platform_file.dart';
import 'package:mobile/features/chat/models/chat_models.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

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
      ScaffoldMessenger.maybeOf(context)?.showSnackBar(
        SnackBar(content: Text(context.l10n.assistantGalleryPickError)),
      );
    }
  }

  Future<void> _showAttachmentOptions() async {
    await showModalBottomSheet<void>(
      context: context,
      builder: (sheetContext) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.attach_file_rounded),
              title: Text(context.l10n.assistantAttachFilesAction),
              onTap: () {
                Navigator.of(sheetContext).pop();
                unawaited(_pickAttachment());
              },
            ),
            ListTile(
              leading: const Icon(Icons.photo_library_outlined),
              title: Text(context.l10n.assistantAttachGalleryMediaAction),
              onTap: () {
                Navigator.of(sheetContext).pop();
                unawaited(_pickGalleryMedia());
              },
            ),
          ],
        ),
      ),
    );
  }

  void _send() {
    final text = _controller.text.trim();
    if (text.isEmpty && widget.pendingAttachments.isEmpty) return;
    widget.onSend(text);
    _controller.clear();
  }

  @override
  Widget build(BuildContext context) {
    final colorScheme = shad.Theme.of(context).colorScheme;

    return DecoratedBox(
      decoration: BoxDecoration(
        color: colorScheme.background,
        border: Border(top: BorderSide(color: colorScheme.border)),
      ),
      child: Padding(
        // The chat surface already reserves the system and floating dock inset.
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (widget.pendingAttachments.isNotEmpty)
              _PendingAttachmentStrip(
                attachments: widget.pendingAttachments,
                onRemove: widget.onRemoveAttachment,
              ),
            Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Tooltip(
                  message: context.l10n.chatAttach,
                  child: shad.IconButton.ghost(
                    icon: widget.isUploadingAttachment
                        ? const SizedBox.square(
                            dimension: 18,
                            child: NovaLoadingIndicator(size: 20),
                          )
                        : const Icon(shad.LucideIcons.paperclip, size: 18),
                    onPressed: widget.isUploadingAttachment || widget.isSending
                        ? null
                        : () => unawaited(_showAttachmentOptions()),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: shad.TextField(
                    contextMenuBuilder: platformTextContextMenuBuilder(),
                    controller: _controller,
                    hintText: context.l10n.chatMessagePlaceholder,
                    minLines: 1,
                    maxLines: 5,
                    enabled: !widget.isSending,
                    onSubmitted: (_) => _send(),
                  ),
                ),
                const SizedBox(width: 8),
                shad.PrimaryButton(
                  onPressed: widget.isSending ? null : _send,
                  child: widget.isSending
                      ? const SizedBox.square(
                          dimension: 18,
                          child: NovaLoadingIndicator(size: 20),
                        )
                      : const Icon(shad.LucideIcons.send, size: 18),
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
    final colorScheme = shad.Theme.of(context).colorScheme;

    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Wrap(
        spacing: 8,
        runSpacing: 8,
        children: attachments
            .map(
              (attachment) => Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 10,
                  vertical: 7,
                ),
                decoration: BoxDecoration(
                  color: colorScheme.muted,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: colorScheme.border),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      attachment.isImage
                          ? shad.LucideIcons.image
                          : shad.LucideIcons.file,
                      size: 15,
                    ),
                    const SizedBox(width: 6),
                    ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 180),
                      child: Text(
                        attachment.filename,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    const SizedBox(width: 6),
                    GestureDetector(
                      onTap: () => onRemove(attachment.id),
                      child: const Icon(shad.LucideIcons.x, size: 14),
                    ),
                  ],
                ),
              ),
            )
            .toList(growable: false),
      ),
    );
  }
}
