import 'dart:async';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:mobile/core/input/platform_text_context_menu.dart';
import 'package:mobile/features/chat/models/chat_models.dart';
import 'package:mobile/l10n/l10n.dart';
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
  final ValueChanged<PlatformFile> onPickAttachment;
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
    final result = await FilePicker.pickFiles(
      withData: true,
    );
    final file = result?.files.firstOrNull;
    if (file != null) {
      widget.onPickAttachment(file);
    }
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
        padding: EdgeInsets.fromLTRB(
          12,
          10,
          12,
          10 + MediaQuery.paddingOf(context).bottom,
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
            Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Tooltip(
                  message: context.l10n.chatAttach,
                  child: shad.IconButton.ghost(
                    icon: widget.isUploadingAttachment
                        ? const SizedBox.square(
                            dimension: 18,
                            child: shad.CircularProgressIndicator(),
                          )
                        : const Icon(shad.LucideIcons.paperclip, size: 18),
                    onPressed: widget.isUploadingAttachment || widget.isSending
                        ? null
                        : () => unawaited(_pickAttachment()),
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
                          child: shad.CircularProgressIndicator(),
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
