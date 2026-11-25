import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_quill/flutter_quill.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/documents/document_links.dart';
import 'package:mobile/features/documents/view/document_image_embed.dart';
import 'package:mobile/features/documents/view/document_mention_embed.dart';
import 'package:mobile/features/documents/view/document_opaque_embeds.dart';
import 'package:mobile/features/documents/view/document_shortcuts.dart';
import 'package:mobile/features/documents/view/document_table_embed.dart';
import 'package:mobile/features/tasks_boards/widgets/task_description_embed_builders.dart';
import 'package:mobile/features/tasks_boards/widgets/task_description_viewer.dart'
    show taskDescriptionStyles;
import 'package:mobile/l10n/l10n.dart';

enum DocumentSaveStatus { idle, saving, saved, error }

/// Opens a document link with the session when it needs one.
void defaultDocumentLinkOpener(String url) => unawaited(openDocumentLink(url));

/// Full-screen document body: metadata, status and a Quill editor. The
/// document title lives in the shell top bar, where it is edited inline.
class DocumentEditor extends StatelessWidget {
  const DocumentEditor({
    required this.editor,
    required this.focusNode,
    required this.scrollController,
    required this.status,
    required this.owner,
    required this.onLink,
    required this.onHighlight,
    this.onEditImage,
    this.onEditTable,
    this.onOpenLink = defaultDocumentLinkOpener,
    this.lastEdited,
    super.key,
  });

  final QuillController editor;
  final FocusNode focusNode;
  final ScrollController scrollController;
  final DocumentSaveStatus status;
  final String owner;
  final VoidCallback onLink;
  final VoidCallback onHighlight;
  final DocumentImageEditCallback? onEditImage;
  final DocumentTableEditCallback? onEditTable;

  /// Opens a tapped link, given as stored.
  final ValueChanged<String> onOpenLink;
  final String? lastEdited;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final tokens = AppTokens.of(context);
    // The task description's styles resolve the web's swatch variables
    // (`var(--calendar-bg-red)`) in the current theme, as the web does.
    final editorStyles = taskDescriptionStyles(context);
    final statusLabel = switch (status) {
      DocumentSaveStatus.idle => null,
      DocumentSaveStatus.saving => l10n.documentsSaving,
      DocumentSaveStatus.saved => l10n.documentsSaved,
      DocumentSaveStatus.error => l10n.documentsSaveError,
    };
    return Localizations.override(
      context: context,
      delegates: const [FlutterQuillLocalizations.delegate],
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Wrap(
            spacing: AppSpacing.md,
            runSpacing: AppSpacing.xs,
            children: [
              AppMetaItem(icon: LucideIcons.user, label: owner),
              if (lastEdited case final edited?)
                AppMetaItem(icon: LucideIcons.clock, label: edited),
            ],
          ),
          if (statusLabel != null)
            Padding(
              padding: const EdgeInsets.only(bottom: AppSpacing.sm),
              child: Text(
                statusLabel,
                style: tokens.typography.xSmall.copyWith(
                  color: status == DocumentSaveStatus.error
                      ? tokens.colorScheme.destructive
                      : tokens.colorScheme.mutedForeground,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ),
          Expanded(
            child: QuillEditor.basic(
              controller: editor,
              focusNode: focusNode,
              scrollController: scrollController,
              config: QuillEditorConfig(
                placeholder: l10n.documentsContentHint,
                padding: const EdgeInsets.only(
                  top: AppSpacing.sm,
                  bottom: AppSpacing.lg,
                ),
                customStyles: editorStyles,
                contextMenuBuilder: (context, state) => documentContextMenu(
                  context,
                  state,
                  editor: editor,
                  onLink: onLink,
                  onHighlight: onHighlight,
                ),
                customShortcuts: documentShortcuts(),
                customActions: documentShortcutActions(
                  editor: editor,
                  onLink: onLink,
                ),
                // Workspace file links are relative, as the web stores them.
                customLinkPrefixes: const [documentWorkspaceLinkPrefix],
                onLaunchUrl: onOpenLink,
                embedBuilders: [
                  DocumentImageEmbedBuilder(onEdit: onEditImage),
                  const TaskDescriptionVideoEmbedBuilder(),
                  const DocumentMentionEmbedBuilder(),
                  DocumentTableEmbedBuilder(onEdit: onEditTable),
                  const TaskDescriptionDividerEmbedBuilder(),
                  const DocumentOpaqueBlockEmbedBuilder(),
                  const DocumentOpaqueInlineEmbedBuilder(),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// The platform selection menu plus the web bubble menu's most used marks,
/// shown while text is selected.
Widget documentContextMenu(
  BuildContext context,
  QuillRawEditorState state, {
  required QuillController editor,
  required VoidCallback onLink,
  required VoidCallback onHighlight,
}) {
  final l10n = context.l10n;
  final selection = editor.selection;
  void run(VoidCallback action) {
    state.hideToolbar();
    action();
  }

  void toggle(Attribute<dynamic> attribute) {
    final on = editor.getSelectionStyle().attributes.containsKey(attribute.key);
    editor.formatSelection(on ? Attribute.clone(attribute, null) : attribute);
  }

  return TextFieldTapRegion(
    child: AdaptiveTextSelectionToolbar.buttonItems(
      anchors: state.contextMenuAnchors,
      buttonItems: [
        ...state.contextMenuButtonItems,
        if (!selection.isCollapsed) ...[
          ContextMenuButtonItem(
            label: l10n.documentsFormatBold,
            onPressed: () => run(() => toggle(Attribute.bold)),
          ),
          ContextMenuButtonItem(
            label: l10n.documentsFormatItalic,
            onPressed: () => run(() => toggle(Attribute.italic)),
          ),
          ContextMenuButtonItem(
            label: l10n.documentsFormatHighlight,
            onPressed: () => run(onHighlight),
          ),
          ContextMenuButtonItem(
            label: l10n.documentsFormatLink,
            onPressed: () => run(onLink),
          ),
        ],
      ],
    ),
  );
}
