part of 'cms_page.dart';

extension _CmsCollectionEditor on _CmsPageState {
  String _slugify(String value) {
    return value
        .trim()
        .toLowerCase()
        .replaceAll(RegExp('[^a-z0-9]+'), '-')
        .replaceAll(RegExp(r'^-+|-+$'), '');
  }

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
    final saved = await _showCmsSheet<bool>(
      context: context,
      onDispose: () {
        titleController.dispose();
        slugController.dispose();
        typeController.dispose();
        descriptionController.dispose();
      },
      builder: (context) => StatefulBuilder(
        builder: (context, setSheetState) => Padding(
          padding: EdgeInsets.fromLTRB(
            20,
            20,
            20,
            20 + MediaQuery.viewInsetsOf(context).bottom,
          ),
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  collection == null
                      ? context.l10n.cmsNewCollection
                      : context.l10n.cmsEditCollection,
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: titleController,
                  autofocus: true,
                  decoration: InputDecoration(labelText: context.l10n.cmsTitle),
                  onChanged: (value) {
                    if (collection == null) {
                      slugController.text = _slugify(value);
                    }
                  },
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: slugController,
                  decoration: InputDecoration(labelText: context.l10n.cmsSlug),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: typeController,
                  decoration: InputDecoration(
                    labelText: context.l10n.cmsCollectionType,
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: descriptionController,
                  maxLines: 3,
                  decoration: InputDecoration(
                    labelText: context.l10n.cmsDescription,
                  ),
                ),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text(context.l10n.cmsCollectionEnabled),
                  value: enabled,
                  onChanged: (value) => setSheetState(() => enabled = value),
                ),
                if (failure != null)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: Text(
                      failure!,
                      style: TextStyle(
                        color: Theme.of(context).colorScheme.error,
                      ),
                    ),
                  ),
                FilledButton(
                  onPressed: busy
                      ? null
                      : () async {
                          final title = titleController.text.trim();
                          final slug = slugController.text.trim();
                          final type = typeController.text.trim();
                          final description = descriptionController.text.trim();
                          if (title.isEmpty || slug.isEmpty || type.isEmpty) {
                            setSheetState(
                              () => failure = context.l10n.commonRequired,
                            );
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
                                description: description.isEmpty
                                    ? null
                                    : description,
                              );
                            } else {
                              await _repository.updateCollection(
                                wsId,
                                collection.id,
                                title: title,
                                slug: slug,
                                collectionType: type,
                                description: description.isEmpty
                                    ? null
                                    : description,
                                isEnabled: enabled,
                              );
                            }
                            if (mounted && context.mounted) {
                              Navigator.of(context).pop(true);
                            }
                          } on Object catch (error) {
                            if (!mounted || !context.mounted) return;
                            setSheetState(() {
                              busy = false;
                              failure = error is ApiException
                                  ? error.message
                                  : context.l10n.commonSomethingWentWrong;
                            });
                          }
                        },
                  child: Text(context.l10n.commonSave),
                ),
              ],
            ),
          ),
        ),
      ),
    );

    if (!mounted || saved != true) return;
    await _reload();
  }
}
