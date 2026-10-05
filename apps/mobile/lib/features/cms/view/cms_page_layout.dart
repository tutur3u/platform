part of 'cms_page.dart';

extension _CmsPageLayout on _CmsPageState {
  Widget _buildWorkspace(BuildContext context) {
    final l10n = context.l10n;
    final query = _searchController.text.trim().toLowerCase();
    bool matches(Iterable<String?> fields) =>
        fields.any((value) => (value ?? '').toLowerCase().contains(query));
    final collections = _collections
        .where((row) => matches([row.title, row.slug, row.description]))
        .toList();
    final titles = {for (final row in _collections) row.id: row.title};
    final entries = _entries
        .where(
          (row) =>
              (_status == null || row.status == _status) &&
              matches([
                row.title,
                row.slug,
                row.summary,
                titles[row.collectionId],
              ]),
        )
        .toList();
    final libraryCount = collections.length + entries.length + 3;
    return shad.Scaffold(
      child: Stack(
        children: [
          ShellTitleOverride(
            ownerId: 'cms-root-title',
            locations: const {Routes.cms},
            title: l10n.cmsTitleApp,
          ),
          ShellMiniNav(
            ownerId: 'cms-root-nav',
            locations: const {Routes.cms},
            deepLinkBackRoute: Routes.apps,
            items: [
              ShellMiniNavItemSpec(
                id: 'cms-back',
                icon: Icons.chevron_left,
                label: l10n.navBack,
                callbackToken: _searching,
                onPressed: _back,
              ),
              ShellMiniNavItemSpec(
                id: 'cms-overview',
                icon: Icons.dashboard_customize_outlined,
                label: l10n.cmsOverview,
                callbackToken: _section,
                selected: _section == 0,
                onPressed: () => _updateState(() => _section = 0),
              ),
              ShellMiniNavItemSpec(
                id: 'cms-library',
                icon: Icons.collections_bookmark_outlined,
                label: l10n.cmsLibrary,
                callbackToken: _section,
                selected: _section == 1,
                onPressed: () => _updateState(() => _section = 1),
              ),
            ],
          ),
          ShellChromeActions(
            ownerId: 'cms-root-actions',
            locations: const {Routes.cms},
            onBack: _back,
            onResetSection: _resetSearch,
            actions: [
              if (_section == 1 && !_denied)
                ShellActionSpec(
                  id: 'cms-search',
                  icon: Icons.search_rounded,
                  tooltip: l10n.cmsSearchHint,
                  inDock: true,
                  callbackToken: _searching,
                  searchController: _searching ? _searchController : null,
                  searchHint: l10n.cmsSearchHint,
                  onSearchChanged: (_) => _updateState(() {}),
                  onCloseSearch: _resetSearch,
                  onPressed: () => _updateState(() => _searching = true),
                ),
              ShellActionSpec(
                id: 'cms-refresh',
                icon: Icons.refresh_rounded,
                tooltip: l10n.commonRefresh,
                callbackToken: _isLoading,
                enabled: !_isLoading,
                onPressed: () => _reload(force: true),
              ),
              if (!_denied)
                ShellActionSpec(
                  id: 'cms-new-collection',
                  icon: Icons.create_new_folder_outlined,
                  tooltip: l10n.cmsNewCollection,
                  callbackToken: widget.workspaceId,
                  onPressed: _showCollectionEditor,
                ),
              if (!_denied && _collections.isNotEmpty)
                ShellActionSpec(
                  id: 'cms-new-entry',
                  icon: Icons.add_rounded,
                  tooltip: l10n.cmsNewEntry,
                  highlighted: true,
                  callbackToken: _collections.length,
                  onPressed: _showEntryEditor,
                ),
            ],
          ),
          ResponsiveWrapper(
            maxWidth: ResponsivePadding.maxContentWidth(context.deviceClass),
            child: NovaRefreshIndicator(
              onRefresh: () => _reload(force: true),
              child: ListView.builder(
                key: ValueKey((_section, widget.actorId, widget.workspaceId)),
                physics: const AlwaysScrollableScrollPhysics(),
                padding: EdgeInsets.fromLTRB(
                  16,
                  8,
                  16,
                  40 + MediaQuery.paddingOf(context).bottom,
                ),
                itemCount: _section == 0 ? 2 : libraryCount + 1,
                itemBuilder: (context, index) {
                  if (index == 0) {
                    if (_isLoading && _summary == null) {
                      return const CmsLoadingSkeleton();
                    }
                    if (_error != null) {
                      return Padding(
                        padding: const EdgeInsets.only(bottom: 16),
                        child: Row(
                          children: [
                            const Icon(Icons.info_outline_rounded),
                            const SizedBox(width: 8),
                            Expanded(child: Text(_error!)),
                            TextButton(
                              onPressed: _isLoading
                                  ? null
                                  : () => _reload(force: true),
                              child: Text(l10n.commonRetry),
                            ),
                          ],
                        ),
                      );
                    }
                    return const SizedBox.shrink();
                  }
                  if (_section == 0) return _buildCmsOverview(this, context);
                  if (index == 1) return _libraryFilters(context);
                  if (index == 2) {
                    return _libraryHeading(
                      l10n.cmsCollections,
                      collections.length,
                    );
                  }
                  final offset = index - 3;
                  if (offset < collections.length) {
                    final row = collections[offset];
                    return Padding(
                      key: ValueKey('collection:${row.id}'),
                      padding: const EdgeInsets.only(bottom: 12),
                      child: PendingSyncFrame(
                        workspaceId: _wsId,
                        feature: 'cms',
                        entityId: row.id,
                        child: _CollectionTile(
                          collection: row,
                          onEdit: () => _showCollectionEditor(row),
                          onDelete: () => _deleteCollection(row),
                        ),
                      ),
                    );
                  }
                  if (offset == collections.length) {
                    return _libraryHeading(l10n.cmsEntries, entries.length);
                  }
                  final row = entries[offset - collections.length - 1];
                  return Padding(
                    key: ValueKey('entry:${row.id}'),
                    padding: const EdgeInsets.only(bottom: 12),
                    child: PendingSyncFrame(
                      workspaceId: _wsId,
                      feature: 'cms',
                      entityId: row.id,
                      child: _EntryTile(
                        entry: row,
                        collectionTitle: titles[row.collectionId],
                        statusLabel: _statusLabel(context, row.status),
                        onEdit: () => _showEntryEditor(row),
                        onDelete: () => _deleteEntry(row),
                      ),
                    ),
                  );
                },
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _libraryHeading(String title, int count) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 12),
    child: Text(
      '$title · $count',
      style: Theme.of(context).textTheme.titleMedium,
    ),
  );

  Widget _libraryFilters(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 8),
    child: Column(
      children: [
        DropdownButtonFormField<String>(
          key: ValueKey(_selectedCollectionId),
          initialValue: _selectedCollectionId,
          isExpanded: true,
          decoration: InputDecoration(labelText: context.l10n.cmsCollection),
          items: [
            DropdownMenuItem<String>(
              child: Text(context.l10n.cmsAllCollections),
            ),
            ..._collections.map(
              (row) => DropdownMenuItem(
                value: row.id,
                child: Text(row.title, overflow: TextOverflow.ellipsis),
              ),
            ),
          ],
          onChanged: _denied
              ? null
              : (value) {
                  _updateState(() => _selectedCollectionId = value);
                  unawaited(_reloadEntries());
                },
        ),
        const SizedBox(height: 12),
        DropdownButtonFormField<String>(
          initialValue: _status,
          isExpanded: true,
          decoration: InputDecoration(labelText: context.l10n.cmsStatus),
          items: [
            DropdownMenuItem<String>(child: Text(context.l10n.commonAll)),
            ..._CmsPageState._statuses.map(
              (status) => DropdownMenuItem(
                value: status,
                child: Text(_statusLabel(context, status)),
              ),
            ),
          ],
          onChanged: (value) => _updateState(() => _status = value),
        ),
      ],
    ),
  );
}
