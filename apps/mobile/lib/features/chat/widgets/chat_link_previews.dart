import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/core/router/mobile_link_launcher.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/chat/data/chat_link_preview_store.dart';
import 'package:mobile/features/chat/models/chat_models.dart';

final _urlPattern = RegExp(r'''https?://[^\s<>"']+''', caseSensitive: false);
final _trailingPunctuation = RegExp(r'[.,;:!?)\]]+$');

/// The distinct http(s) links in [content], in order, without trailing
/// punctuation, capped at [ChatLinkPreviewStore.maxUrls] (as web does).
List<String> extractChatLinks(String content) {
  final seen = <String>{};
  for (final match in _urlPattern.allMatches(content)) {
    final url = match[0]!.replaceFirst(_trailingPunctuation, '');
    if (url.isNotEmpty) seen.add(url);
    if (seen.length == ChatLinkPreviewStore.maxUrls) break;
  }
  return seen.toList(growable: false);
}

/// Preview cards for the links in a synced message. Only links the server
/// resolved to a title or description get a card; images are not shown.
class ChatLinkPreviews extends StatefulWidget {
  const ChatLinkPreviews({
    required this.store,
    required this.wsId,
    required this.conversationId,
    required this.content,
    super.key,
  });

  final ChatLinkPreviewStore store;
  final String wsId;
  final String conversationId;
  final String content;

  @override
  State<ChatLinkPreviews> createState() => _ChatLinkPreviewsState();
}

class _ChatLinkPreviewsState extends State<ChatLinkPreviews> {
  late List<String> _urls;
  Future<List<ChatLinkPreview>>? _previews;

  @override
  void initState() {
    super.initState();
    _resolve();
  }

  @override
  void didUpdateWidget(ChatLinkPreviews oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.content != widget.content ||
        oldWidget.conversationId != widget.conversationId ||
        oldWidget.wsId != widget.wsId ||
        oldWidget.store != widget.store) {
      _resolve();
    }
  }

  void _resolve() {
    _urls = extractChatLinks(widget.content);
    _previews = _urls.isEmpty
        ? null
        : widget.store.load(widget.wsId, widget.conversationId, _urls);
  }

  @override
  Widget build(BuildContext context) {
    final previews = _previews;
    if (previews == null) return const SizedBox.shrink();
    return FutureBuilder<List<ChatLinkPreview>>(
      future: previews,
      initialData: widget.store.cached(
        widget.wsId,
        widget.conversationId,
        _urls,
      ),
      builder: (context, snapshot) {
        final byUrl = {
          for (final preview in snapshot.data ?? const <ChatLinkPreview>[])
            preview.url: preview,
        };
        final visible = [
          for (final url in _urls)
            if (byUrl[url] case final preview?
                when _hasText(preview.title) || _hasText(preview.description))
              preview,
        ];
        if (visible.isEmpty) return const SizedBox.shrink();
        return Padding(
          padding: const EdgeInsets.only(top: AppSpacing.xs),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            spacing: AppSpacing.xs,
            children: [
              for (final preview in visible)
                ChatLinkPreviewCard(preview: preview),
            ],
          ),
        );
      },
    );
  }
}

bool _hasText(String? value) => value != null && value.trim().isNotEmpty;

/// Site, title and description of one resolved link; opens it on tap.
class ChatLinkPreviewCard extends StatelessWidget {
  const ChatLinkPreviewCard({required this.preview, super.key});

  final ChatLinkPreview preview;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final colors = tokens.colorScheme;
    final uri = Uri.tryParse(preview.url);
    final site = _hasText(preview.siteName) ? preview.siteName! : uri?.host;
    final title = preview.title?.trim();
    final description = preview.description?.trim();
    return AppCard(
      padding: const EdgeInsets.all(AppSpacing.md),
      borderRadius: BorderRadius.circular(AppRadius.md),
      semanticLabel: [
        if (_hasText(title)) title,
        if (_hasText(site)) site,
      ].join(', '),
      onTap: uri == null ? null : () => unawaited(openMobileLink(context, uri)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        spacing: AppSpacing.xxs,
        children: [
          if (_hasText(site))
            Row(
              spacing: AppSpacing.xs,
              children: [
                Icon(
                  LucideIcons.globe,
                  size: 12,
                  color: colors.mutedForeground,
                ),
                Flexible(
                  child: Text(
                    site!,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: tokens.typography.xSmall.copyWith(
                      color: colors.mutedForeground,
                    ),
                  ),
                ),
              ],
            ),
          if (_hasText(title))
            Text(
              title!,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: tokens.typography.small.copyWith(
                color: colors.foreground,
                fontWeight: FontWeight.w600,
              ),
            ),
          if (_hasText(description))
            Text(
              description!,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: tokens.typography.xSmall.copyWith(
                color: colors.mutedForeground,
              ),
            ),
        ],
      ),
    );
  }
}
