import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_quill/flutter_quill.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/tasks_boards/utils/tiptap_quill_models.dart'
    show tipTapBlockEmbedType, tipTapInlineEmbedType;
import 'package:mobile/l10n/l10n.dart';

/// A web block mobile cannot edit yet (a toggle, a bibliography, a YouTube
/// frame or a newer node type). It shows a read-only preview and is saved
/// back exactly as the web stored it.
class DocumentOpaqueBlockEmbedBuilder extends EmbedBuilder {
  const DocumentOpaqueBlockEmbedBuilder();

  @override
  String get key => tipTapBlockEmbedType;

  @override
  bool get expanded => true;

  @override
  Widget build(BuildContext context, EmbedContext embedContext) {
    final node = _decode(embedContext.node.value.data);
    return _OpaqueBlockCard(node: node);
  }
}

/// An inline web atom mobile cannot edit yet, such as a citation.
class DocumentOpaqueInlineEmbedBuilder extends EmbedBuilder {
  const DocumentOpaqueInlineEmbedBuilder();

  @override
  String get key => tipTapInlineEmbedType;

  @override
  bool get expanded => false;

  @override
  WidgetSpan buildWidgetSpan(Widget widget) =>
      WidgetSpan(alignment: PlaceholderAlignment.middle, child: widget);

  @override
  Widget build(BuildContext context, EmbedContext embedContext) {
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    final node = _decode(embedContext.node.value.data);
    final label = node?['type'] == 'citation'
        ? context.l10n.documentsInlineCitation
        : context.l10n.documentsInlineUnsupported;
    return Semantics(
      label: label,
      child: Container(
        margin: const EdgeInsets.symmetric(horizontal: AppSpacing.xxs),
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.xs,
          vertical: AppSpacing.xxs,
        ),
        decoration: BoxDecoration(
          color: c.muted,
          borderRadius: BorderRadius.circular(AppRadius.xs),
        ),
        child: Text(
          label,
          style: tokens.typography.xSmall.copyWith(
            color: c.mutedForeground,
            fontWeight: FontWeight.w500,
          ),
        ),
      ),
    );
  }
}

class _OpaqueBlockCard extends StatelessWidget {
  const _OpaqueBlockCard({required this.node});

  final Map<String, dynamic>? node;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    final type = node?['type'];
    final (icon, title) = switch (type) {
      'details' => (LucideIcons.listCollapse, l10n.documentsBlockToggle),
      'citationBibliography' => (
        LucideIcons.bookOpen,
        l10n.documentsBlockBibliography,
      ),
      'youtube' => (LucideIcons.squarePlay, l10n.documentsBlockVideo),
      _ => (LucideIcons.fileQuestion, l10n.documentsBlockUnsupported),
    };
    final preview = _previewText(node);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(AppSpacing.md),
        decoration: BoxDecoration(
          color: c.muted.withValues(alpha: 0.5),
          border: Border.all(color: c.border),
          borderRadius: BorderRadius.circular(AppRadius.md),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, size: 16, color: c.mutedForeground),
            const SizedBox(width: AppSpacing.sm),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    preview.isEmpty ? title : preview,
                    maxLines: 3,
                    overflow: TextOverflow.ellipsis,
                    style: tokens.typography.small.copyWith(
                      color: c.foreground,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: AppSpacing.xxs),
                  Text(
                    preview.isEmpty
                        ? l10n.documentsBlockEditOnWeb
                        : '$title · ${l10n.documentsBlockEditOnWeb}',
                    style: tokens.typography.xSmall.copyWith(
                      color: c.mutedForeground,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

Map<String, dynamic>? _decode(Object? data) {
  if (data is! String || data.isEmpty) return null;
  try {
    final decoded = jsonDecode(data);
    return decoded is Map<String, dynamic> ? decoded : null;
  } on FormatException {
    return null;
  }
}

/// The node's own text, for a toggle its summary first.
String _previewText(Map<String, dynamic>? node) {
  if (node == null) return '';
  final buffer = StringBuffer();
  void visit(Object? value) {
    if (buffer.length > 240) return;
    if (value is! Map) return;
    final text = value['text'];
    if (text is String) {
      buffer.write(text);
      return;
    }
    final content = value['content'];
    if (content is! List) return;
    for (final child in content) {
      visit(child);
      if (child is Map && child['type'] != 'text' && buffer.isNotEmpty) {
        buffer.write(' ');
      }
    }
  }

  visit(node);
  return buffer.toString().replaceAll(RegExp(r'\s+'), ' ').trim();
}
