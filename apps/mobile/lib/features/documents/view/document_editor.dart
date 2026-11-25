import 'package:flutter/material.dart';
import 'package:flutter_quill/flutter_quill.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/documents/view/document_opaque_embeds.dart';
import 'package:mobile/features/documents/view/document_shortcuts.dart';
import 'package:mobile/features/tasks_boards/widgets/task_description_embed_builders.dart';
import 'package:mobile/features/tasks_boards/widgets/task_description_viewer.dart'
    show taskDescriptionStyles;
import 'package:mobile/l10n/l10n.dart';

enum DocumentSaveStatus { idle, saving, saved, error }

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
    this.lastEdited,
    super.key,
  });

  final QuillController editor;
  final FocusNode focusNode;
  final ScrollController scrollController;
  final DocumentSaveStatus status;
  final String owner;
  final VoidCallback onLink;
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
                customShortcuts: documentShortcuts(),
                customActions: documentShortcutActions(
                  editor: editor,
                  onLink: onLink,
                ),
                embedBuilders: const [
                  TaskDescriptionImageEmbedBuilder(),
                  TaskDescriptionVideoEmbedBuilder(),
                  TaskDescriptionMentionEmbedBuilder(),
                  TaskDescriptionTableEmbedBuilder(),
                  TaskDescriptionDividerEmbedBuilder(),
                  DocumentOpaqueBlockEmbedBuilder(),
                  DocumentOpaqueInlineEmbedBuilder(),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
