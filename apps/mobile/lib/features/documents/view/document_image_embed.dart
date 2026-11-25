import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_quill/flutter_quill.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/documents/document_media.dart';
import 'package:mobile/features/documents/view/document_block_insert.dart';
import 'package:mobile/features/tasks_boards/widgets/task_description_embed_builders.dart';
import 'package:mobile/l10n/l10n.dart';

/// Called with the offset and node of an image the user tapped to edit.
typedef DocumentImageEditCallback =
    void Function(int offset, Map<String, dynamic> node);

/// Renders document images at the share of the page the web gives them.
/// Tapping an image stored as a whole node opens [onEdit]; other images
/// (bare URLs inside text) render as the task description does.
class DocumentImageEmbedBuilder extends EmbedBuilder {
  const DocumentImageEmbedBuilder({this.onEdit});

  final DocumentImageEditCallback? onEdit;

  @override
  String get key => BlockEmbed.imageType;

  @override
  Widget build(BuildContext context, EmbedContext embedContext) {
    final data = embedContext.node.value.data;
    final node = documentImageNodeFromEmbed(data);
    if (node == null) {
      return const TaskDescriptionImageEmbedBuilder().build(
        context,
        embedContext,
      );
    }
    final onEdit = this.onEdit;
    return DocumentImage(
      node: node,
      onTap: onEdit == null || embedContext.readOnly
          ? null
          : () => onEdit(embedContext.node.documentOffset, node),
    );
  }
}

/// An image node drawn at its stored share of the available width.
class DocumentImage extends StatelessWidget {
  const DocumentImage({required this.node, this.onTap, super.key});

  final Map<String, dynamic> node;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final c = AppTokens.of(context).colorScheme;
    final attrs = node['attrs'] as Map;
    final url = resolveTaskDescriptionUrl((attrs['src'] as String).trim());
    final alt = attrs['alt'];
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
      child: LayoutBuilder(
        builder: (context, constraints) {
          final width = constraints.maxWidth * documentImageFraction(node);
          final cacheWidth = (width * MediaQuery.devicePixelRatioOf(context))
              .round();
          return Align(
            alignment: Alignment.centerLeft,
            child: Semantics(
              image: true,
              button: onTap != null,
              label: alt is String && alt.isNotEmpty
                  ? alt
                  : context.l10n.documentsInsertImage,
              child: GestureDetector(
                key: const ValueKey('document-image'),
                behavior: HitTestBehavior.opaque,
                onTap: onTap,
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(AppRadius.xs),
                  child: SizedBox(
                    width: width,
                    child: Image.network(
                      url,
                      fit: BoxFit.fitWidth,
                      headers: trustedAuthHeadersForUrl(url),
                      cacheWidth: cacheWidth > 0 ? cacheWidth : null,
                      // Reserve a box until the first frame so the page
                      // does not jump and the image can be tapped at once.
                      frameBuilder: (context, child, frame, sync) =>
                          frame != null || sync
                          ? child
                          : AspectRatio(
                              aspectRatio: 16 / 9,
                              child: ColoredBox(
                                color: c.muted,
                                child: const Center(
                                  child: AppLoadingIndicator(),
                                ),
                              ),
                            ),
                      errorBuilder: (context, error, stackTrace) => AspectRatio(
                        aspectRatio: 16 / 9,
                        child: ColoredBox(
                          color: c.muted,
                          child: Icon(
                            LucideIcons.imageOff,
                            color: c.mutedForeground,
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}

/// What the image sheet asks for.
typedef DocumentImageAction = ({String? preset, bool view, bool delete});

/// Resizes, opens or deletes an image. Sizes are the web's presets.
class DocumentImageSheet extends StatelessWidget {
  const DocumentImageSheet({required this.node, super.key});

  final Map<String, dynamic> node;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final current = documentImageSizePreset(node);
    void pop(DocumentImageAction action) =>
        Navigator.of(context).pop<DocumentImageAction>(action);
    return AppSheetScaffold(
      title: l10n.documentsImageEdit,
      icon: LucideIcons.image,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            l10n.documentsImageSize,
            style: AppTokens.of(
              context,
            ).typography.small.copyWith(fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: AppSpacing.xs),
          Wrap(
            spacing: AppSpacing.xs,
            runSpacing: AppSpacing.xs,
            children: [
              for (final MapEntry(:key, :value)
                  in documentImageSizePresets.entries)
                AppChip(
                  key: ValueKey('document-image-size-$key'),
                  label: Text('$value%'),
                  selected: key == current,
                  inMutuallyExclusiveGroup: true,
                  onSelected: (_) =>
                      pop((preset: key, view: false, delete: false)),
                ),
            ],
          ),
          const SizedBox(height: AppSpacing.md),
          AppGroupedCard(
            children: [
              AppGroupedRow(
                leading: const AppIconTile(icon: LucideIcons.maximize2),
                title: Text(l10n.documentsImageView),
                onTap: () => pop((preset: null, view: true, delete: false)),
              ),
              AppGroupedRow(
                key: const ValueKey('document-image-delete'),
                leading: const AppIconTile(
                  icon: LucideIcons.trash2,
                  tone: AppTone.destructive,
                ),
                title: Text(l10n.documentsImageDelete),
                onTap: () => pop((preset: null, view: false, delete: true)),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// Shows an image node full screen, zoomable, above the shell.
Future<void> showDocumentImageViewer(
  BuildContext context,
  Map<String, dynamic> node,
) {
  final url = resolveTaskDescriptionUrl(
    ((node['attrs'] as Map)['src'] as String).trim(),
  );
  return showAppDialog<void>(
    context: context,
    useRootNavigator: true,
    builder: (context) => GestureDetector(
      onTap: () => Navigator.of(context).pop(),
      child: InteractiveViewer(
        maxScale: 5,
        child: Image.network(
          url,
          fit: BoxFit.contain,
          headers: trustedAuthHeadersForUrl(url),
        ),
      ),
    ),
  );
}

/// Applies the image sheet's [action] to the image at [offset], unless the
/// document no longer holds that image there.
void applyDocumentImageAction(
  BuildContext context,
  QuillController editor,
  int offset,
  Map<String, dynamic> node,
  DocumentImageAction action,
) {
  final embedded = documentEmbedAt(editor, offset, documentImageEmbedType);
  if (embedded != documentImageEmbedValue(node)) return;
  if (action.delete) {
    deleteDocumentBlock(editor, offset);
  } else if (action.preset case final preset?) {
    replaceDocumentEmbed(
      editor,
      offset,
      BlockEmbed(
        documentImageEmbedType,
        documentImageEmbedValue(resizeDocumentImage(node, preset)),
      ),
    );
  } else if (action.view) {
    unawaited(showDocumentImageViewer(context, node));
  }
}
