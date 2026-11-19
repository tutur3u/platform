import 'package:flutter/material.dart';
import 'package:flutter_quill/flutter_quill.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/l10n/l10n.dart';

enum DocumentSaveStatus { idle, saving, saved, error }

/// Full-screen document body: inline title, status and a Quill editor.
class DocumentEditor extends StatelessWidget {
  const DocumentEditor({
    required this.title,
    required this.editor,
    required this.focusNode,
    required this.scrollController,
    required this.status,
    required this.onTitleChanged,
    super.key,
  });

  final TextEditingController title;
  final QuillController editor;
  final FocusNode focusNode;
  final ScrollController scrollController;
  final DocumentSaveStatus status;
  final ValueChanged<String> onTitleChanged;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final tokens = AppTokens.of(context);
    final editorStyles = DefaultStyles.getInstance(context);
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
          AppTextField(
            controller: title,
            borderless: true,
            placeholder: l10n.documentsTitlePlaceholder,
            textCapitalization: TextCapitalization.sentences,
            style: tokens.typography.x2Large.copyWith(
              color: tokens.colorScheme.foreground,
              fontWeight: FontWeight.w700,
              height: 1.2,
            ),
            onChanged: onTitleChanged,
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
              ),
            ),
          ),
        ],
      ),
    );
  }
}

List<AppFormatAction> documentFormatActions({
  required BuildContext context,
  required QuillController editor,
  required VoidCallback onLink,
}) {
  final l10n = context.l10n;
  final style = editor.getSelectionStyle();
  bool selected(Attribute<dynamic> attribute) =>
      style.attributes.containsKey(attribute.key);

  void toggle(Attribute<dynamic> attribute) =>
      editor.formatSelection(attribute);

  return [
    AppFormatAction(
      icon: LucideIcons.heading1,
      tooltip: l10n.documentsFormatHeading1,
      selected: selected(Attribute.h1),
      onPressed: () => toggle(Attribute.h1),
    ),
    AppFormatAction(
      icon: LucideIcons.heading2,
      tooltip: l10n.documentsFormatHeading2,
      selected: selected(Attribute.h2),
      onPressed: () => toggle(Attribute.h2),
    ),
    AppFormatAction(
      icon: LucideIcons.heading3,
      tooltip: l10n.documentsFormatHeading3,
      selected: selected(Attribute.h3),
      onPressed: () => toggle(Attribute.h3),
    ),
    AppFormatAction(
      icon: LucideIcons.bold,
      tooltip: l10n.documentsFormatBold,
      selected: selected(Attribute.bold),
      onPressed: () => toggle(Attribute.bold),
    ),
    AppFormatAction(
      icon: LucideIcons.italic,
      tooltip: l10n.documentsFormatItalic,
      selected: selected(Attribute.italic),
      onPressed: () => toggle(Attribute.italic),
    ),
    AppFormatAction(
      icon: LucideIcons.list,
      tooltip: l10n.documentsFormatBullets,
      selected: selected(Attribute.ul),
      onPressed: () => toggle(Attribute.ul),
    ),
    AppFormatAction(
      icon: LucideIcons.listOrdered,
      tooltip: l10n.documentsFormatNumbers,
      selected: selected(Attribute.ol),
      onPressed: () => toggle(Attribute.ol),
    ),
    AppFormatAction(
      icon: LucideIcons.listChecks,
      tooltip: l10n.documentsFormatChecklist,
      selected: style.attributes['list']?.value == 'unchecked',
      onPressed: () =>
          editor.formatSelection(Attribute.fromKeyValue('list', 'unchecked')),
    ),
    AppFormatAction(
      icon: LucideIcons.link,
      tooltip: l10n.documentsFormatLink,
      selected: selected(Attribute.link),
      onPressed: onLink,
    ),
  ];
}
