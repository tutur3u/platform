import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/cache/offline_mutation_queue.dart';
import 'package:mobile/core/router/mobile_link_launcher.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/chat/cubit/chat_cubit.dart';
import 'package:mobile/features/chat/models/chat_models.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:video_player/video_player.dart';

class ChatAttachmentPreview extends StatefulWidget {
  const ChatAttachmentPreview({
    required this.attachment,
    this.compact = false,
    this.onRemove,
    this.onPrimary = false,
    super.key,
  });

  final ChatAttachment attachment;
  final bool compact;
  final VoidCallback? onRemove;

  /// Drawn inside a primary message bubble.
  final bool onPrimary;

  @override
  State<ChatAttachmentPreview> createState() => _ChatAttachmentPreviewState();
}

class _ChatAttachmentPreviewState extends State<ChatAttachmentPreview> {
  late Future<String> _readUrl;

  bool get _isVideo =>
      widget.attachment.contentType?.startsWith('video/') ?? false;
  bool get _isMedia => widget.attachment.isImage || _isVideo;

  bool get _isPending => OfflineMutationQueue.instance.pending.value.any(
    (record) =>
        record.feature == 'chat' &&
        record.method == 'CHAT_UPLOAD' &&
        record.entityId == widget.attachment.id,
  );

  /// Media previews resolve their signed URL up front; files resolve it
  /// only when opened, so a file row never fetches what it does not show.
  Future<String> _initialReadUrl() => _isPending || !_isMedia
      ? Future.value('')
      : context.read<ChatCubit>().attachmentReadUrl(widget.attachment);

  @override
  void initState() {
    super.initState();
    _readUrl = _initialReadUrl();
  }

  @override
  void didUpdateWidget(covariant ChatAttachmentPreview oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.attachment.id != widget.attachment.id) {
      _readUrl = _initialReadUrl();
    }
  }

  Future<void> _openFile() async {
    final cubit = context.read<ChatCubit>();
    try {
      final url = await cubit.attachmentReadUrl(widget.attachment);
      final uri = Uri.tryParse(url);
      if (!mounted || uri == null) return;
      await openMobileLink(context, uri);
    } on Exception {
      if (!mounted) return;
      showAppToast(
        context,
        message: context.l10n.chatAttachmentOpenError,
        variant: AppAlertVariant.destructive,
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final attachment = widget.attachment;
    if (_isPending) return _fileTile(context);
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
                        icon: const Icon(LucideIcons.refreshCw),
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
                    const Center(child: Icon(LucideIcons.imageOff)),
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
                            child: Icon(LucideIcons.circlePlay, size: 38),
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
                    icon: const Icon(LucideIcons.x),
                  ),
                ),
            ],
          ),
        );
      },
    );
  }

  Widget _fileTile(BuildContext context) {
    if (widget.compact) {
      return InputChip(
        visualDensity: VisualDensity.compact,
        avatar: const Icon(LucideIcons.paperclip, size: 16),
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
    return ChatFileRow(
      attachment: widget.attachment,
      onPrimary: widget.onPrimary,
      onOpen: _isPending ? null : () => unawaited(_openFile()),
    );
  }
}

/// A shared file inside a message: type icon, name and size.
class ChatFileRow extends StatelessWidget {
  const ChatFileRow({
    required this.attachment,
    this.onOpen,
    this.onPrimary = false,
    super.key,
  });

  final ChatAttachment attachment;
  final VoidCallback? onOpen;
  final bool onPrimary;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final colors = tokens.colorScheme;
    final ink = onPrimary ? colors.primaryForeground : colors.foreground;
    final muted = onPrimary
        ? colors.primaryForeground.withValues(alpha: 0.75)
        : colors.mutedForeground;
    final type = attachment.contentType ?? '';
    final icon = type.startsWith('audio/')
        ? LucideIcons.fileAudio
        : type.contains('pdf') || type.startsWith('text/')
        ? LucideIcons.fileText
        : LucideIcons.file;
    final size = attachment.sizeBytes;
    final radius = BorderRadius.circular(AppRadius.sm);
    return Padding(
      padding: const EdgeInsets.only(top: AppSpacing.xs),
      child: Material(
        color: onPrimary
            ? colors.primaryForeground.withValues(alpha: 0.12)
            : colors.muted.withValues(alpha: 0.6),
        borderRadius: radius,
        child: InkWell(
          borderRadius: radius,
          onTap: onOpen,
          child: Padding(
            padding: const EdgeInsets.all(AppSpacing.sm),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(icon, size: 22, color: ink),
                const SizedBox(width: AppSpacing.sm),
                Flexible(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        attachment.filename,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: tokens.typography.small.copyWith(
                          color: ink,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      if (size != null && size > 0)
                        Text(
                          formatChatFileSize(size),
                          style: tokens.typography.xSmall.copyWith(
                            color: muted,
                          ),
                        ),
                    ],
                  ),
                ),
                if (onOpen != null) ...[
                  const SizedBox(width: AppSpacing.sm),
                  Icon(LucideIcons.download, size: 16, color: muted),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

String formatChatFileSize(int bytes) {
  const units = ['B', 'KB', 'MB', 'GB'];
  var value = bytes.toDouble();
  var unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  final digits = value >= 10 || unit == 0 ? 0 : 1;
  return '${value.toStringAsFixed(digits)} ${units[unit]}';
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
                  icon: const Icon(LucideIcons.x),
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
