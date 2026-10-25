part of 'cms_page.dart';

extension _CmsCollectionEditor on _CmsPageState {
  Future<void> _showCollectionEditor([CmsCollection? collection]) async {
    final wsId = _wsId;
    if (!mounted || _denied) return;

    final titleController = TextEditingController(text: collection?.title);
    final slugController = TextEditingController(text: collection?.slug);
    final typeController = TextEditingController(
      text: collection?.collectionType ?? 'articles',
    );
    final descriptionController = TextEditingController(
      text: collection?.description,
    );
    var enabled = collection?.isEnabled ?? true;

    var busy = false;
    String? failure;
    final result = await _showCmsSheet<_CmsEditorResult>(
      context: context,
      onDispose: () {
        titleController.dispose();
        slugController.dispose();
        typeController.dispose();
        descriptionController.dispose();
      },
      builder: (context) => StatefulBuilder(
        builder: (context, setSheetState) {
          final l10n = context.l10n;
          Future<void> save() async {
            final title = titleController.text.trim();
            final slug = slugController.text.trim();
            final type = typeController.text.trim();
            final description = descriptionController.text.trim();
            if (title.isEmpty || slug.isEmpty || type.isEmpty) {
              setSheetState(() => failure = l10n.commonRequired);
              return;
            }
            if (!mounted || !context.mounted) return;
            setSheetState(() {
              busy = true;
              failure = null;
            });
            try {
              if (collection == null) {
                await _repository.createCollection(
                  wsId,
                  title: title,
                  slug: slug,
                  collectionType: type,
                  description: description.isEmpty ? null : description,
                );
              } else {
                await _repository.updateCollection(
                  wsId,
                  collection.id,
                  title: title,
                  slug: slug,
                  collectionType: type,
                  description: description.isEmpty ? null : description,
                  isEnabled: enabled,
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
            title: collection == null
                ? l10n.cmsNewCollection
                : l10n.cmsEditCollection,
            icon: LucideIcons.libraryBig,
            busy: busy,
            failure: failure,
            onSave: () => unawaited(save()),
            onDelete: collection == null
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
                      if (collection == null) {
                        slugController.text = _slugify(value);
                      }
                    },
                  ),
                  AppTextField(controller: slugController, label: l10n.cmsSlug),
                  AppTextField(
                    controller: typeController,
                    label: l10n.cmsCollectionType,
                  ),
                  AppTextField(
                    controller: descriptionController,
                    label: l10n.cmsDescription,
                    minLines: 2,
                    maxLines: 4,
                  ),
                ],
              ),
              if (collection != null)
                (
                  l10n.cmsPublishingSection,
                  [
                    AppToggleRow(
                      title: Text(l10n.cmsCollectionEnabled),
                      value: enabled,
                      onChanged: (value) =>
                          setSheetState(() => enabled = value),
                    ),
                  ],
                ),
            ],
          );
        },
      ),
    );

    if (!mounted || result == null) return;
    if (result == _CmsEditorResult.delete && collection != null) {
      await _deleteCollection(collection);
      return;
    }
    await _reload();
  }
}
