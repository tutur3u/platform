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
    var status = entry?.status ?? 'draft';

    var busy = false;
    String? failure;
    final saved = await _showCmsSheet<bool>(
      context: context,
      onDispose: () {
        titleController.dispose();
        slugController.dispose();
        subtitleController.dispose();
        summaryController.dispose();
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
                  entry == null
                      ? context.l10n.cmsNewEntry
                      : context.l10n.cmsEditEntry,
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                const SizedBox(height: 16),
                DropdownButtonFormField<String>(
                  initialValue: collectionId,
                  decoration: InputDecoration(
                    labelText: context.l10n.cmsCollection,
                  ),
                  items: _collections
                      .map(
                        (collection) => DropdownMenuItem(
                          value: collection.id,
                          child: Text(collection.title),
                        ),
                      )
                      .toList(growable: false),
                  onChanged: entry == null
                      ? (value) {
                          if (value == null) return;
                          setSheetState(() => collectionId = value);
                        }
                      : null,
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: titleController,
                  autofocus: true,
                  decoration: InputDecoration(labelText: context.l10n.cmsTitle),
                  onChanged: (value) {
                    if (entry == null) {
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
                DropdownButtonFormField<String>(
                  initialValue: _CmsPageState._statuses.contains(status)
                      ? status
                      : 'draft',
                  decoration: InputDecoration(
                    labelText: context.l10n.cmsStatus,
                  ),
                  items: _CmsPageState._statuses
                      .map(
                        (item) => DropdownMenuItem(
                          value: item,
                          child: Text(_statusLabel(context, item)),
                        ),
                      )
                      .toList(growable: false),
                  onChanged: (value) {
                    if (value == null) return;
                    setSheetState(() => status = value);
                  },
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: subtitleController,
                  decoration: InputDecoration(
                    labelText: context.l10n.cmsSubtitle,
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: summaryController,
                  maxLines: 4,
                  decoration: InputDecoration(
                    labelText: context.l10n.cmsSummary,
                  ),
                ),
                const SizedBox(height: 16),
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
                          final subtitle = subtitleController.text.trim();
                          final summary = summaryController.text.trim();
                          if (title.isEmpty || slug.isEmpty) {
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
