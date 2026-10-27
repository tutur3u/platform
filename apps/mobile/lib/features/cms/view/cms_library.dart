part of 'cms_page.dart';

extension _CmsLibrary on _CmsPageState {
  /// Collections, then entries filtered by status, collection and search.
  /// Rows are built lazily; consecutive rows share one grouped surface.
  Widget _buildLibrary(BuildContext context) {
    final l10n = context.l10n;
    final query = _searchController.text.trim().toLowerCase();
    bool matches(Iterable<String?> fields) =>
        fields.any((value) => (value ?? '').toLowerCase().contains(query));
    final collections = _collections
        .where((row) => matches([row.title, row.slug, row.description]))
        .toList();
    final titles = {for (final row in _collections) row.id: row.title};
    final entryCounts = {
      for (final row in _summary?.collections ?? const <CmsSummaryCollection>[])
        row.id: row.totalEntries,
    };
    final searched = _entries
        .where(
          (row) => matches([
            row.title,
            row.slug,
            row.summary,
            titles[row.collectionId],
          ]),
        )
        .toList();
    final entries = searched
        .where((row) => _status == null || row.status == _status)
        .toList();

    final status = _statusBlock(context);
    final notice = _refreshNotice(context);
    final items = <Widget Function()>[
      if (status != null) () => status,
      if (status == null) ...[
        ?(notice == null ? null : () => notice),
        () => AppSectionHeader(title: l10n.cmsCollections),
        if (collections.isEmpty)
          () => AppGroupedCard(
            children: [
              AppStateMessage.inline(
                icon: LucideIcons.libraryBig,
                title: query.isEmpty
                    ? l10n.cmsNoCollections
                    : l10n.cmsNoEntriesMatch,
                message: query.isEmpty ? l10n.cmsNoCollectionsMessage : null,
                actionLabel: query.isEmpty ? l10n.cmsNewCollection : null,
                onAction: query.isEmpty ? _showCollectionEditor : null,
              ),
            ],
          ),
        for (final (index, row) in collections.indexed)
          () => AppGroupedSlice(
            key: ValueKey('collection:${row.id}'),
            position: AppSlicePosition.of(index, collections.length),
            dividerInset: _CmsStatus.rowDividerInset,
            child: PendingSyncFrame(
              workspaceId: _wsId,
              feature: 'cms',
              entityId: row.id,
              child: _CollectionRow(
                collection: row,
                entryCount: entryCounts[row.id],
                onTap: _denied ? null : () => _showCollectionEditor(row),
              ),
            ),
          ),
        () => Padding(
          padding: const EdgeInsets.only(top: AppLayout.sectionGap),
          child: _libraryFilters(context, searched),
        ),
        if (entries.isEmpty)
          () => AppGroupedCard(
            children: [
              AppStateMessage.inline(
                icon: LucideIcons.fileSearch,
                title: _entries.isEmpty
                    ? l10n.cmsNoEntries
                    : l10n.cmsNoEntriesMatch,
                message: _entries.isEmpty
                    ? null
                    : l10n.cmsNoEntriesMatchMessage,
              ),
            ],
          ),
        for (final (index, row) in entries.indexed)
          () => AppGroupedSlice(
            key: ValueKey('entry:${row.id}'),
            position: AppSlicePosition.of(index, entries.length),
            dividerInset: _CmsStatus.rowDividerInset,
            child: PendingSyncFrame(
              workspaceId: _wsId,
              feature: 'cms',
              entityId: row.id,
              child: _EntryRow(
                entry: row,
                collectionTitle: titles[row.collectionId],
                onTap: _denied ? null : () => _showEntryEditor(row),
              ),
            ),
          ),
      ],
    ];
    return AppPageListView.builder(
      key: ValueKey(('library', widget.actorId, _wsId)),
      physics: const AlwaysScrollableScrollPhysics(),
      itemCount: items.length,
      itemBuilder: (context, index) => items[index](),
    );
  }

  Widget _libraryFilters(BuildContext context, List<CmsEntry> searched) {
    final l10n = context.l10n;
    final selectedCollection = _collections
        .where((row) => row.id == _selectedCollectionId)
        .firstOrNull;
    int count(String status) =>
        searched.where((row) => row.status == status).length;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        AppSectionHeader(title: l10n.cmsEntries),
        AppFilterBar<String?>(
          options: [
            AppFilterOption(
              value: null,
              label: l10n.commonAll,
              count: searched.length,
            ),
            for (final status in _CmsStatus.statuses)
              AppFilterOption(
                value: status,
                label: _CmsStatus.label(context, status),
                count: count(status),
              ),
          ],
          selected: _status,
          onSelected: (value) => _updateState(() => _status = value),
        ),
        const SizedBox(height: AppSpacing.sm),
        Align(
          alignment: AlignmentDirectional.centerStart,
          child: AppFilterButton(
            icon: LucideIcons.folder,
            label: selectedCollection?.title ?? l10n.cmsAllCollections,
            tooltip: l10n.cmsFilterByCollection,
            active: selectedCollection != null,
            onPressed: _denied || _collections.isEmpty
                ? null
                : () => _pickCollection(context),
          ),
        ),
        const SizedBox(height: AppSpacing.md),
      ],
    );
  }

  Future<void> _pickCollection(BuildContext context) async {
    final l10n = context.l10n;
    final picked = await _showCmsSheet<({String? id})>(
      context: context,
      onDispose: () {},
      builder: (sheetContext) => AppSheetScaffold(
        title: l10n.cmsFilterByCollection,
        slivers: [
          SliverList.list(
            children: [
              for (final row in [null, ..._collections])
                AppOptionTile(
                  title: row?.title ?? l10n.cmsAllCollections,
                  leading: Icon(
                    row == null ? LucideIcons.layers : LucideIcons.libraryBig,
                  ),
                  selected: row?.id == _selectedCollectionId,
                  onTap: () => Navigator.of(sheetContext).pop((id: row?.id)),
                ),
            ],
          ),
        ],
      ),
    );
    if (!mounted || picked == null || picked.id == _selectedCollectionId) {
      return;
    }
    _updateState(() => _selectedCollectionId = picked.id);
    await _reloadEntries();
  }
}
