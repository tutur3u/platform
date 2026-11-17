import 'dart:async';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/mail/data/mail_repository.dart';
import 'package:mobile/l10n/l10n.dart';

String mailAttachmentMimeType(Map<String, dynamic> file) =>
    (file['contentType'] as String? ?? '')
        .split(';')
        .first
        .trim()
        .toLowerCase();

bool mailAttachmentHasImageThumbnail(Map<String, dynamic> file) => const {
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/bmp',
  'image/avif',
}.contains(mailAttachmentMimeType(file));

/// Authenticated attachment presentation without exposing a protected URL.
class MailAttachmentTile extends StatefulWidget {
  const MailAttachmentTile({
    required this.repository,
    required this.workspaceId,
    required this.mailboxId,
    required this.messageId,
    required this.file,
    required this.onPreview,
    required this.onDownload,
    this.loadThumbnail = false,
    super.key,
  });

  final MailRepository repository;
  final String workspaceId;
  final String mailboxId;
  final String messageId;
  final Map<String, dynamic> file;
  final VoidCallback? onPreview;
  final VoidCallback? onDownload;

  /// The owner admits a bounded subset of tiles for automatic thumbnail reads.
  final bool loadThumbnail;

  @override
  State<MailAttachmentTile> createState() => _MailAttachmentTileState();
}

class _MailAttachmentTileState extends State<MailAttachmentTile> {
  static const int _maxThumbnailBytes = 4 * 1024 * 1024;
  Uint8List? _bytes;
  bool _loading = false;
  bool _failed = false;
  int _generation = 0;

  bool get _eligible {
    final size = widget.file['sizeBytes'];
    return mailAttachmentHasImageThumbnail(widget.file) &&
        size is num &&
        size > 0 &&
        size <= _maxThumbnailBytes;
  }

  @override
  void initState() {
    super.initState();
    if (widget.loadThumbnail && _eligible) unawaited(_load());
  }

  @override
  void didUpdateWidget(covariant MailAttachmentTile oldWidget) {
    super.didUpdateWidget(oldWidget);
    final changed =
        oldWidget.repository != widget.repository ||
        oldWidget.workspaceId != widget.workspaceId ||
        oldWidget.mailboxId != widget.mailboxId ||
        oldWidget.messageId != widget.messageId ||
        oldWidget.file['id'] != widget.file['id'];
    if (changed) {
      _generation++;
      _bytes = null;
      _loading = false;
      _failed = false;
    }
    if ((changed || !oldWidget.loadThumbnail) &&
        widget.loadThumbnail &&
        _eligible) {
      unawaited(_load());
    }
  }

  Future<void> _load() async {
    if (_loading || !_eligible) return;
    final generation = ++_generation;
    setState(() {
      _loading = true;
      _failed = false;
    });
    try {
      final bytes = await widget.repository.attachment(
        widget.workspaceId,
        widget.mailboxId,
        widget.messageId,
        widget.file['id'] as String,
      );
      if (!mounted || generation != _generation) return;
      setState(() {
        _loading = false;
        _failed = bytes.isEmpty || bytes.length > _maxThumbnailBytes;
        _bytes = _failed ? null : bytes;
      });
    } on Object {
      if (!mounted || generation != _generation) return;
      setState(() {
        _loading = false;
        _failed = true;
      });
    }
  }

  IconData get _typeIcon {
    final mime = mailAttachmentMimeType(widget.file);
    if (mime.startsWith('image/')) return Icons.image_outlined;
    if (mime == 'application/pdf') return Icons.picture_as_pdf_outlined;
    if (mime.startsWith('video/')) return Icons.movie_outlined;
    if (mime.startsWith('audio/')) return Icons.audio_file_outlined;
    return Icons.insert_drive_file_outlined;
  }

  String _metadata(BuildContext context) {
    final mime = mailAttachmentMimeType(widget.file);
    final size = widget.file['sizeBytes'];
    final parts = <String>[if (mime.isNotEmpty) mime];
    if (size is num && size > 0) {
      final format = NumberFormat.decimalPattern(
        Localizations.localeOf(context).toLanguageTag(),
      )..maximumFractionDigits = 1;
      parts.add(
        size >= 1024 * 1024
            ? '${format.format(size / (1024 * 1024))} MB'
            : '${format.format(size / 1024)} KB',
      );
    }
    return parts.join(' · ');
  }

  Widget _thumbnail(BuildContext context) {
    final colors = AppTokens.of(context).colorScheme;
    final bytes = _bytes;
    return ColoredBox(
      color: colors.muted,
      child: SizedBox(
        height: 152,
        width: double.infinity,
        child: _loading
            ? const Center(child: AppLoadingIndicator())
            : bytes != null
            ? Image.memory(
                bytes,
                fit: BoxFit.cover,
                cacheWidth: 720,
                cacheHeight: 360,
                excludeFromSemantics: true,
                errorBuilder: (_, _, _) => _thumbnailFailure(context),
              )
            : _failed
            ? _thumbnailFailure(context)
            : Icon(_typeIcon, size: 36, color: colors.mutedForeground),
      ),
    );
  }

  Widget _thumbnailFailure(BuildContext context) => Center(
    child: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(
          _typeIcon,
          color: AppTokens.of(context).colorScheme.mutedForeground,
        ),
        TextButton.icon(
          onPressed: _load,
          icon: const Icon(Icons.refresh),
          label: Text(context.l10n.commonRetry),
          style: TextButton.styleFrom(minimumSize: const Size(44, 44)),
        ),
      ],
    ),
  );

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final metadata = _metadata(context);
    final radius = BorderRadius.circular(tokens.radiusMd);
    return Material(
      color: tokens.colorScheme.card,
      shape: RoundedRectangleBorder(
        borderRadius: radius,
        side: BorderSide(color: tokens.colorScheme.border),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Semantics(
            label: widget.file['filename'] as String? ?? '',
            button: widget.onPreview != null,
            child: InkWell(onTap: widget.onPreview, child: _thumbnail(context)),
          ),
          Padding(
            padding: const EdgeInsets.all(AppSpacing.sm),
            child: Row(
              children: [
                Icon(_typeIcon, color: tokens.colorScheme.mutedForeground),
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: InkWell(
                    onTap: widget.onPreview,
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(minHeight: 44),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            widget.file['filename'] as String? ?? '',
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: Theme.of(context).textTheme.labelLarge,
                          ),
                          if (metadata.isNotEmpty)
                            Text(
                              metadata,
                              style: Theme.of(context).textTheme.bodySmall
                                  ?.copyWith(
                                    color: tokens.colorScheme.mutedForeground,
                                  ),
                            ),
                        ],
                      ),
                    ),
                  ),
                ),
                IconButton(
                  tooltip: context.l10n.mailDownload,
                  onPressed: widget.onDownload,
                  constraints: const BoxConstraints(
                    minWidth: 44,
                    minHeight: 44,
                  ),
                  icon: const Icon(Icons.download_outlined),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
