import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
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
    final isMedia = attachment.isImage || isVideo;
    final localPath = attachment.localPath;
    final url = attachment.signedUrl ?? attachment.previewUrl;
    final hasLocalFile =
        localPath != null &&
        localPath.isNotEmpty &&
        File(localPath).existsSync();
    final canPreview =
        isMedia && (hasLocalFile || (url != null && url.isNotEmpty));
    final label = _displayName(context, attachment);
    final failed =
        attachment.uploadState == AssistantAttachmentUploadState.error;

    return ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: 180),
      child: InputChip(
        visualDensity: VisualDensity.compact,
        avatar: _thumbnail(context, localPath, url, isVideo),
        label: Text(
          failed
              ? '$label · ${context.l10n.assistantAttachmentFailedShort}'
              : label,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
        onPressed: canPreview
            ? () => showDialog<void>(
                context: context,
                builder: (_) =>
                    _MediaPreviewDialog(attachment: attachment, label: label),
              )
            : null,
        onDeleted: onRemove,
      ),
    );
  }

  Widget _thumbnail(
    BuildContext context,
    String? localPath,
    String? url,
    bool isVideo,
  ) {
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
            errorBuilder: (_, _, _) => const Icon(Icons.image_outlined),
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
            errorBuilder: (_, _, _) => const Icon(Icons.image_outlined),
          ),
        );
      }
    }
    return Icon(
      attachment.uploadState == AssistantAttachmentUploadState.error
          ? Icons.error_outline_rounded
          : isVideo
          ? Icons.videocam_outlined
          : attachment.type.startsWith('audio/')
          ? Icons.graphic_eq_rounded
          : Icons.attach_file_rounded,
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
    if (widget.attachment.type.startsWith('video/')) {
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
      await player.play();
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
    return Dialog.fullscreen(
      child: SafeArea(
        child: Column(
          children: [
            Row(
              children: [
                IconButton(
                  tooltip: MaterialLocalizations.of(context).closeButtonTooltip,
                  icon: const Icon(Icons.close_rounded),
                  onPressed: () => Navigator.of(context).pop(),
                ),
                Expanded(
                  child: Text(
                    widget.label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ],
            ),
            Expanded(
              child: Center(
                child: _failed
                    ? Text(context.l10n.assistantMediaPreviewError)
                    : player != null
                    ? player.value.isInitialized
                          ? AspectRatio(
                              aspectRatio: player.value.aspectRatio,
                              child: GestureDetector(
                                onTap: () => unawaited(_toggleVideo(player)),
                                child: VideoPlayer(player),
                              ),
                            )
                          : const CircularProgressIndicator()
                    : path != null && path.isNotEmpty && File(path).existsSync()
                    ? Image.file(File(path), fit: BoxFit.contain)
                    : url != null && url.isNotEmpty
                    ? Image.network(url, fit: BoxFit.contain)
                    : Text(context.l10n.assistantMediaPreviewError),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
