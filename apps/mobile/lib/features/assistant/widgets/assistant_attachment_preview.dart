import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/assistant/widgets/assistant_document_link.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:video_player/video_player.dart';

class AssistantAttachmentPreview extends StatelessWidget {
  const AssistantAttachmentPreview({
    required this.attachment,
    this.onRemove,
    super.key,
  });

  final AssistantAttachment attachment;
  final VoidCallback? onRemove;

  @override
  Widget build(BuildContext context) {
    final isVideo = attachment.type.startsWith('video/');
    final isMedia =
        attachment.isImage || isVideo || attachment.type.startsWith('audio/');
    final localPath = attachment.localPath;
    final url = attachment.signedUrl ?? attachment.previewUrl;
    final hasLocalFile =
        localPath != null &&
        localPath.isNotEmpty &&
        File(localPath).existsSync();
    final canPreview =
        isMedia && (hasLocalFile || (url != null && url.isNotEmpty));
    final documentUri = isMedia ? null : assistantDocumentUri(url);
    final label = _displayName(context, attachment);
    final failed =
        attachment.uploadState == AssistantAttachmentUploadState.error;

    return ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: 180),
      child: AppChip(
        avatar: _thumbnail(context, localPath, url, isVideo),
        label: Text(
          failed
              ? '$label · ${context.l10n.assistantAttachmentFailedShort}'
              : label,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
        onPressed: canPreview
            ? () => showAppSheet<void>(
                context: context,
                builder: (_) =>
                    _MediaPreviewDialog(attachment: attachment, label: label),
                size: AppSheetSize.large,
              )
            : documentUri != null &&
                  attachment.uploadState ==
                      AssistantAttachmentUploadState.uploaded
            ? () => unawaited(openAssistantDocument(context, documentUri))
            : null,
        onDeleted: onRemove,
        deleteTooltip:
            '${MaterialLocalizations.of(context).deleteButtonTooltip}: $label',
        tooltip: failed
            ? '$label · ${context.l10n.assistantAttachmentUploadFailed}'
            : attachment.uploadState == AssistantAttachmentUploadState.uploading
            ? '$label · ${context.l10n.commonLoading}'
            : label,
      ),
    );
  }

  Widget _thumbnail(
    BuildContext context,
    String? localPath,
    String? url,
    bool isVideo,
  ) {
    if (attachment.uploadState == AssistantAttachmentUploadState.uploading) {
      return Semantics(
        label: context.l10n.commonLoading,
        child: const SizedBox.square(
          dimension: 18,
          child: CircularProgressIndicator(strokeWidth: 2),
        ),
      );
    }
    if (attachment.isImage) {
      if (localPath != null &&
          localPath.isNotEmpty &&
          File(localPath).existsSync()) {
        return ClipRRect(
          borderRadius: BorderRadius.circular(4),
          child: Image.file(
            File(localPath),
            width: 25,
            height: 25,
            fit: BoxFit.cover,
            errorBuilder: (_, _, _) => const Icon(LucideIcons.image),
          ),
        );
      }
      if (url != null && url.isNotEmpty) {
        return ClipRRect(
          borderRadius: BorderRadius.circular(4),
          child: Image.network(
            url,
            width: 25,
            height: 25,
            fit: BoxFit.cover,
            errorBuilder: (_, _, _) => const Icon(LucideIcons.image),
          ),
        );
      }
    }
    return Icon(
      attachment.uploadState == AssistantAttachmentUploadState.error
          ? LucideIcons.circleAlert
          : isVideo
          ? LucideIcons.video
          : attachment.type.startsWith('audio/')
          ? LucideIcons.audioLines
          : LucideIcons.paperclip,
      size: 18,
      color: attachment.uploadState == AssistantAttachmentUploadState.error
          ? Theme.of(context).colorScheme.error
          : null,
    );
  }
}

String _displayName(BuildContext context, AssistantAttachment attachment) {
  final name = attachment.name.trim();
  if (RegExp(
    '^image_picker_[0-9a-f-]{20,}',
    caseSensitive: false,
  ).hasMatch(name)) {
    return attachment.type.startsWith('video/')
        ? context.l10n.assistantVideoAttachment
        : context.l10n.assistantPhotoAttachment;
  }
  return name;
}

class _MediaPreviewDialog extends StatefulWidget {
  const _MediaPreviewDialog({required this.attachment, required this.label});

  final AssistantAttachment attachment;
  final String label;

  @override
  State<_MediaPreviewDialog> createState() => _MediaPreviewDialogState();
}

class _MediaPreviewDialogState extends State<_MediaPreviewDialog> {
  VideoPlayerController? _player;
  bool _failed = false;

  @override
  void initState() {
    super.initState();
    if (widget.attachment.type.startsWith('video/') ||
        widget.attachment.type.startsWith('audio/')) {
      final path = widget.attachment.localPath;
      final url = widget.attachment.signedUrl ?? widget.attachment.previewUrl;
      final hasLocalFile =
          path != null && path.isNotEmpty && File(path).existsSync();
      if (!hasLocalFile && (url == null || url.isEmpty)) {
        _failed = true;
        return;
      }
      final player = hasLocalFile
          ? VideoPlayerController.file(File(path))
          : VideoPlayerController.networkUrl(Uri.parse(url!));
      _player = player;
      unawaited(_initializeVideo(player));
    }
  }

  Future<void> _initializeVideo(VideoPlayerController player) async {
    try {
      await player.initialize();
      if (!mounted) return;
      setState(() {});
      if (!widget.attachment.type.startsWith('audio/')) await player.play();
    } on Object {
      if (mounted) {
        setState(() => _failed = true);
      }
    }
  }

  Future<void> _toggleVideo(VideoPlayerController player) async {
    if (player.value.isPlaying) {
      await player.pause();
    } else {
      await player.play();
    }
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    if (_player case final player?) unawaited(player.dispose());
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final path = widget.attachment.localPath;
    final url = widget.attachment.signedUrl ?? widget.attachment.previewUrl;
    final player = _player;
    return AppSheetScaffold(
      title: widget.label,
      slivers: [
        SliverFillRemaining(
          child: Column(
            children: [
              Expanded(
                child: Center(
                  child: _failed
                      ? Text(context.l10n.assistantMediaPreviewError)
                      : player != null
                      ? player.value.isInitialized
                            ? widget.attachment.type.startsWith('audio/')
                                  ? ValueListenableBuilder<VideoPlayerValue>(
                                      valueListenable: player,
                                      builder: (context, value, _) => Column(
                                        mainAxisSize: MainAxisSize.min,
                                        children: [
                                          const Icon(
                                            LucideIcons.audioLines,
                                            size: 64,
                                          ),
                                          AppIconButton(
                                            tooltip: value.isPlaying
                                                ? context
                                                      .l10n
                                                      .assistantPreviewPause
                                                : context
                                                      .l10n
                                                      .assistantPreviewPlay,
                                            onPressed: () =>
                                                unawaited(_toggleVideo(player)),
                                            icon: Icon(
                                              value.isPlaying
                                                  ? LucideIcons.pause
                                                  : LucideIcons.play,
                                            ),
                                          ),
                                          VideoProgressIndicator(
                                            player,
                                            allowScrubbing: true,
                                            padding: const EdgeInsets.all(24),
                                          ),
                                        ],
                                      ),
                                    )
                                  : AspectRatio(
                                      aspectRatio: player.value.aspectRatio,
                                      child: GestureDetector(
                                        onTap: () =>
                                            unawaited(_toggleVideo(player)),
                                        child: VideoPlayer(player),
                                      ),
                                    )
                            : const CircularProgressIndicator()
                      : path != null &&
                            path.isNotEmpty &&
                            File(path).existsSync()
                      ? Image.file(
                          File(path),
                          fit: BoxFit.contain,
                          errorBuilder: (_, _, _) =>
                              Text(context.l10n.assistantMediaPreviewError),
                        )
                      : url != null && url.isNotEmpty
                      ? Image.network(
                          url,
                          fit: BoxFit.contain,
                          errorBuilder: (_, _, _) =>
                              Text(context.l10n.assistantMediaPreviewError),
                        )
                      : Text(context.l10n.assistantMediaPreviewError),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
