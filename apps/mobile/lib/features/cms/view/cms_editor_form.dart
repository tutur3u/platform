part of 'cms_page.dart';

/// How an editor sheet closed.
enum _CmsEditorResult { saved, delete }

/// Shared frame of the collection and entry editors: grouped field sections,
/// an inline failure, Save as the primary action and Delete for existing
/// items.
class _CmsEditorForm extends StatelessWidget {
  const _CmsEditorForm({
    required this.title,
    required this.icon,
    required this.sections,
    required this.busy,
    required this.onSave,
    this.failure,
    this.onDelete,
  });

  final String title;
  final IconData icon;
  final List<(String, List<Widget>)> sections;
  final bool busy;
  final String? failure;
  final VoidCallback onSave;
  final VoidCallback? onDelete;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final failure = this.failure;
    return AppSheetScaffold(
      title: title,
      icon: icon,
      actions: [
        if (onDelete case final onDelete?)
          AppButton.ghost(
            onPressed: busy ? null : onDelete,
            leading: const Icon(LucideIcons.trash2, size: 16),
            child: Text(l10n.commonDelete),
          ),
        AppButton.primary(
          onPressed: busy ? null : onSave,
          loading: busy,
          child: Text(l10n.commonSave),
        ),
      ],
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (failure != null) ...[
            AppAlert.destructive(title: Text(failure)),
            const SizedBox(height: AppSpacing.lg),
          ],
          for (final (index, (caption, fields)) in sections.indexed) ...[
            if (index > 0) const SizedBox(height: AppLayout.sectionGap),
            AppSectionCaption(caption),
            const SizedBox(height: AppLayout.sectionCaptionGap),
            for (final (fieldIndex, field) in fields.indexed) ...[
              if (fieldIndex > 0) const SizedBox(height: AppSpacing.md),
              field,
            ],
          ],
        ],
      ),
    );
  }
}

/// Slug derived from a title while creating an item.
String _slugify(String value) => value
    .trim()
    .toLowerCase()
    .replaceAll(RegExp('[^a-z0-9]+'), '-')
    .replaceAll(RegExp(r'^-+|-+$'), '');
