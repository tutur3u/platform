import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/features/chat/cubit/chat_cubit.dart';
import 'package:mobile/features/chat/models/chat_models.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:video_player/video_player.dart';

class ChatAttachmentPreview extends StatefulWidget {
  const ChatAttachmentPreview({
    required this.attachment,
    this.compact = false,
    this.onRemove,
    super.key,
  });

  final ChatAttachment attachment;
  final bool compact;
  final VoidCallback? onRemove;

  @override
  State<ChatAttachmentPreview> createState() => _ChatAttachmentPreviewState();
}

class _ChatAttachmentPreviewState extends State<ChatAttachmentPreview> {
  late Future<String> _readUrl;

  bool get _isVideo =>
      widget.attachment.contentType?.startsWith('video/') ?? false;
  bool get _isMedia => widget.attachment.isImage || _isVideo;

  @override
  void initState() {
    super.initState();
    _readUrl = context.read<ChatCubit>().attachmentReadUrl(widget.attachment);
  }

  @override
  void didUpdateWidget(covariant ChatAttachmentPreview oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.attachment.id != widget.attachment.id) {
      _readUrl = context.read<ChatCubit>().attachmentReadUrl(widget.attachment);
    }
  }

  @override
  Widget build(BuildContext context) {
    final attachment = widget.attachment;
    if (!_isMedia) return _fileTile(context);

    return FutureBuilder<String>(
      future: _readUrl,
      builder: (context, snapshot) {
        final url = snapshot.data;
        final preview = url == null
            ? Center(
                child: snapshot.hasError
                    ? IconButton(
                        tooltip: context.l10n.commonRetry,
                        onPressed: () => setState(() {
                          _readUrl = context
                              .read<ChatCubit>()
                              .attachmentReadUrl(attachment);
                        }),
                        icon: const Icon(Icons.refresh_rounded),
                      )
                    : const SizedBox.square(
                        dimension: 22,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      ),
              )
            : attachment.isImage
            ? Image.network(
                url,
                width: double.infinity,
                height: double.infinity,
                fit: BoxFit.cover,
                errorBuilder: (_, _, _) =>
                    const Center(child: Icon(Icons.broken_image_outlined)),
              )
            : _ChatVideoFrame(url: url);
        final size = widget.compact ? 54.0 : 210.0;
        return Padding(
          padding: const EdgeInsets.only(top: 4),
          child: Stack(
            children: [
              InkWell(
                borderRadius: BorderRadius.circular(12),
                onTap: url == null
                    ? null
                    : () => showDialog<void>(
                        context: context,
                        builder: (_) =>
                            _ChatMediaDialog(attachment: attachment, url: url),
                      ),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(12),
                  child: SizedBox(
                    width: widget.compact ? size : double.infinity,
                    height: widget.compact ? size : 170,
                    child: Stack(
                      fit: StackFit.expand,
                      children: [
                        ColoredBox(
                          color: Theme.of(context).colorScheme.surfaceContainer,
                          child: preview,
                        ),
                        if (_isVideo)
                          const Center(
                            child: Icon(
                              Icons.play_circle_fill_rounded,
                              size: 38,
                            ),
                          ),
                      ],
                    ),
                  ),
                ),
              ),
              if (widget.onRemove != null)
                Positioned(
                  right: 2,
                  top: 2,
                  child: IconButton.filledTonal(
                    visualDensity: VisualDensity.compact,
                    iconSize: 16,
                    tooltip: MaterialLocalizations.of(
                      context,
                    ).deleteButtonTooltip,
                    onPressed: widget.onRemove,
                    icon: const Icon(Icons.close_rounded),
                  ),
                ),
            ],
          ),
        );
      },
    );
  }

  Widget _fileTile(BuildContext context) => InputChip(
    visualDensity: VisualDensity.compact,
    avatar: const Icon(Icons.attach_file_rounded, size: 16),
    label: ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: 170),
      child: Text(
        widget.attachment.filename,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
      ),
    ),
    onDeleted: widget.onRemove,
  );
}

class _ChatVideoFrame extends StatefulWidget {
  const _ChatVideoFrame({required this.url});
  final String url;

  @override
  State<_ChatVideoFrame> createState() => _ChatVideoFrameState();
}

class _ChatVideoFrameState extends State<_ChatVideoFrame> {
  VideoPlayerController? _controller;

  @override
  void initState() {
    super.initState();
    _initialize();
  }

  void _initialize() {
    final controller = VideoPlayerController.networkUrl(Uri.parse(widget.url));
    _controller = controller;
    unawaited(
      controller
          .initialize()
          .then((_) {
            if (mounted) setState(() {});
          })
          .catchError((Object _) {}),
    );
  }

  @override
  void didUpdateWidget(covariant _ChatVideoFrame oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.url != widget.url) {
      if (_controller case final previous?) unawaited(previous.dispose());
      _initialize();
    }
  }

  @override
  void dispose() {
    if (_controller case final controller?) unawaited(controller.dispose());
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final controller = _controller;
    return controller == null || !controller.value.isInitialized
        ? const SizedBox.shrink()
        : FittedBox(
            fit: BoxFit.cover,
            child: SizedBox(
              width: controller.value.size.width,
              height: controller.value.size.height,
              child: VideoPlayer(controller),
            ),
          );
  }
}

class _ChatMediaDialog extends StatefulWidget {
  const _ChatMediaDialog({required this.attachment, required this.url});
  final ChatAttachment attachment;
  final String url;

  @override
  State<_ChatMediaDialog> createState() => _ChatMediaDialogState();
}

class _ChatMediaDialogState extends State<_ChatMediaDialog> {
  VideoPlayerController? _controller;
  bool _failed = false;

  @override
  void initState() {
    super.initState();
    if (widget.attachment.contentType?.startsWith('video/') ?? false) {
      final controller = VideoPlayerController.networkUrl(
        Uri.parse(widget.url),
      );
      _controller = controller;
      unawaited(_initialize(controller));
    }
  }

  Future<void> _initialize(VideoPlayerController controller) async {
    try {
      await controller.initialize();
      if (!mounted) return;
      setState(() {});
      await controller.play();
    } on Object {
      if (mounted) setState(() => _failed = true);
    }
  }

  @override
  void dispose() {
    if (_controller case final controller?) unawaited(controller.dispose());
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final controller = _controller;
    return Dialog.fullscreen(
      child: SafeArea(
        child: Column(
          children: [
            Row(
              children: [
                IconButton(
                  tooltip: MaterialLocalizations.of(context).closeButtonTooltip,
                  onPressed: () => Navigator.of(context).pop(),
                  icon: const Icon(Icons.close_rounded),
                ),
                Expanded(
                  child: Text(
                    widget.attachment.filename,
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
                    : controller == null
                    ? InteractiveViewer(
                        child: Image.network(
                          widget.url,
                          fit: BoxFit.contain,
                          errorBuilder: (_, _, _) =>
                              Text(context.l10n.assistantMediaPreviewError),
                        ),
                      )
                    : controller.value.isInitialized
                    ? AspectRatio(
                        aspectRatio: controller.value.aspectRatio,
                        child: GestureDetector(
                          onTap: () async {
                            if (controller.value.isPlaying) {
                              await controller.pause();
                            } else {
                              await controller.play();
                            }
                            if (mounted) setState(() {});
                          },
                          child: VideoPlayer(controller),
                        ),
                      )
                    : const CircularProgressIndicator(),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
