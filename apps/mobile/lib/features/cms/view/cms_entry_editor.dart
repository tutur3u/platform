part of 'cms_page.dart';

extension _CmsEntryEditor on _CmsPageState {
  Future<void> _showEntryEditor([CmsEntry? entry]) async {
    final wsId = _wsId;
    if (!mounted || _denied) return;
    if (_collections.isEmpty) {
      _toast(context.l10n.cmsNoCollections, destructive: true);
      return;
    }

    final titleController = TextEditingController(text: entry?.title);
    final slugController = TextEditingController(text: entry?.slug);
    final subtitleController = TextEditingController(text: entry?.subtitle);
    final summaryController = TextEditingController(text: entry?.summary);
    var collectionId =
        entry?.collectionId ?? _selectedCollectionId ?? _collections.first.id;
    var status = _CmsStatus.statuses.contains(entry?.status)
        ? entry!.status
        : 'draft';

    var busy = false;
    String? failure;
    final result = await _showCmsSheet<_CmsEditorResult>(
      context: context,
      onDispose: () {
        titleController.dispose();
        slugController.dispose();
        subtitleController.dispose();
        summaryController.dispose();
      },
      builder: (context) => StatefulBuilder(
        builder: (context, setSheetState) {
          final l10n = context.l10n;
          Future<void> save() async {
            final title = titleController.text.trim();
            final slug = slugController.text.trim();
            final subtitle = subtitleController.text.trim();
            final summary = summaryController.text.trim();
            if (title.isEmpty || slug.isEmpty) {
              setSheetState(() => failure = l10n.commonRequired);
              return;
            }
            if (!mounted || !context.mounted) return;
            setSheetState(() {
              busy = true;
              failure = null;
            });
            try {
              if (entry == null) {
                await _repository.createEntry(
                  wsId,
                  collectionId: collectionId,
                  title: title,
                  slug: slug,
                  status: status,
                  subtitle: subtitle.isEmpty ? null : subtitle,
                  summary: summary.isEmpty ? null : summary,
                );
              } else {
                await _repository.updateEntry(
                  wsId,
                  entry.id,
                  title: title,
                  slug: slug,
                  status: status,
                  subtitle: subtitle.isEmpty ? null : subtitle,
                  summary: summary.isEmpty ? null : summary,
                );
              }
              if (mounted && context.mounted) {
                Navigator.of(context).pop(_CmsEditorResult.saved);
              }
            } on Object catch (error) {
              if (!mounted || !context.mounted) return;
              setSheetState(() {
                busy = false;
                failure = error is ApiException
                    ? error.message
                    : l10n.commonSomethingWentWrong;
              });
            }
          }

          return _CmsEditorForm(
            title: entry == null ? l10n.cmsNewEntry : l10n.cmsEditEntry,
            icon: LucideIcons.fileText,
            busy: busy,
            failure: failure,
            onSave: () => unawaited(save()),
            onDelete: entry == null
                ? null
                : () => Navigator.of(context).pop(_CmsEditorResult.delete),
            sections: [
              (
                l10n.cmsDetailsSection,
                [
                  AppTextField(
                    controller: titleController,
                    autofocus: true,
                    label: l10n.cmsTitle,
                    onChanged: (value) {
                      if (entry == null) {
                        slugController.text = _slugify(value);
                      }
                    },
                  ),
                  AppTextField(controller: slugController, label: l10n.cmsSlug),
                  AppTextField(
                    controller: subtitleController,
                    label: l10n.cmsSubtitle,
                  ),
                  AppTextField(
                    controller: summaryController,
                    label: l10n.cmsSummary,
                    minLines: 3,
                    maxLines: 6,
                  ),
                ],
              ),
              (
                l10n.cmsPublishingSection,
                [
                  AppSelect<String>(
                    title: l10n.cmsCollection,
                    value: collectionId,
                    // An entry stays in its collection once created.
                    onChanged: entry == null
                        ? (value) => setSheetState(() => collectionId = value)
                        : null,
                    options: [
                      for (final row in _collections)
                        AppSelectOption(
                          value: row.id,
                          label: row.title,
                          icon: LucideIcons.libraryBig,
                        ),
                    ],
                  ),
                  AppSelect<String>(
                    title: l10n.cmsStatus,
                    value: status,
                    onChanged: (value) => setSheetState(() => status = value),
                    options: [
                      for (final item in _CmsStatus.statuses)
                        AppSelectOption(
                          value: item,
                          label: _CmsStatus.label(context, item),
                          icon: _CmsStatus.icon(item),
                        ),
                    ],
                  ),
                ],
              ),
            ],
          );
        },
      ),
    );

    if (!mounted || result == null) return;
    if (result == _CmsEditorResult.delete && entry != null) {
      await _deleteEntry(entry);
      return;
    }
    await _reload();
  }
}
