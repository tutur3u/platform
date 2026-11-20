part of 'drive_page.dart';

extension _DriveBrowser on _DrivePageState {
  Widget _buildBrowser(BuildContext context) {
    final hasWorkspace = _wsId != null && _wsId!.isNotEmpty;
    final currentFolderLabel = _path.isEmpty ? null : _path.split('/').last;

    final selecting = _selectedNames.isNotEmpty;
    return MultiBlocListener(
      listeners: [
        BlocListener<AuthCubit, AuthState>(
          listenWhen: (previous, current) =>
              previous.user?.id != current.user?.id,
          listener: (context, state) => _resetScope(),
        ),
        BlocListener<WorkspaceCubit, WorkspaceState>(
          listenWhen: (previous, current) =>
              previous.currentWorkspace?.id != current.currentWorkspace?.id,
          listener: (context, state) => _resetScope(),
        ),
      ],
      child: Stack(
        children: [
          ShellTitleOverride(
            ownerId: 'drive-title',
            locations: const {Routes.drive},
            title: currentFolderLabel ?? context.l10n.driveTitle,
            showLeadingBrand: _path.isEmpty && !_searching,
          ),
          // The preview covers the list; its chrome steps aside meanwhile.
          if (_previewOpen)
            const SizedBox.shrink()
          else
            ShellMiniNav(
              ownerId: 'drive-root-nav',
              locations: const {Routes.drive},
              deepLinkBackRoute: Routes.apps,
              items: [
                ShellMiniNavItemSpec(
                  id: 'drive-back',
                  icon: Icons.chevron_left,
                  label: context.l10n.navBack,
                  callbackToken: 'back',
                  onPressed: () => context.go(Routes.apps),
                ),
                ShellMiniNavItemSpec(
                  id: 'drive-home',
                  icon: Icons.folder_copy_outlined,
                  label: context.l10n.driveTitle,
                  callbackToken: _path.isEmpty,
                  selected: _path.isEmpty,
                  enabled: hasWorkspace,
                  onPressed: _goToRoot,
                ),
                if (currentFolderLabel != null)
                  ShellMiniNavItemSpec(
                    id: 'drive-folder',
                    icon: Icons.folder_open_outlined,
                    label: currentFolderLabel,
                    callbackToken: _path,
                    selected: true,
                    dropdown: true,
                    enabled: hasWorkspace,
                    onPressed: _showBreadcrumbs,
                  ),
              ],
            ),
          if (_previewOpen)
            const SizedBox.shrink()
          else
            ShellChromeActions(
              ownerId: 'drive-root-actions',
              locations: const {Routes.drive},
              onBack: selecting || _path.isNotEmpty ? _backWithinDrive : null,
              // View precedes Search: phones under 400dp keep only the first
              // dock action in the dock.
              actions: [
                ShellActionSpec(
                  id: 'drive-view',
                  inDock: true,
                  icon: _showGrid ? Icons.view_list : Icons.grid_view_rounded,
                  tooltip: _showGrid
                      ? context.l10n.driveListView
                      : context.l10n.driveGridView,
                  callbackToken: _showGrid,
                  enabled: hasWorkspace,
                  highlighted: _showGrid,
                  onPressed: () {
                    _update(() => _showGrid = !_showGrid);
                  },
                ),
                ShellActionSpec(
                  id: 'drive-sort',
                  inDock: true,
                  icon: Icons.sort_rounded,
                  tooltip: context.l10n.sortBy,
                  callbackToken: '$_sortBy:$_sortOrder',
                  enabled: hasWorkspace,
                  onPressed: _showSortSheet,
                ),
                ShellActionSpec.search(
                  id: 'drive-search',
                  active: _searching,
                  tooltip: context.l10n.driveSearchHint,
                  enabled: hasWorkspace,
                  controller: _searchController,
                  searchHint: context.l10n.driveSearchHint,
                  onSearchChanged: _onSearchChanged,
                  onCloseSearch: _closeSearch,
                  onPressed: () {
                    if (_searching) {
                      _closeSearch();
                    } else {
                      _update(() => _searching = true);
                    }
                  },
                ),
                if (_canManageDrive)
                  ShellActionSpec(
                    id: 'drive-create',
                    icon: Icons.add_rounded,
                    tooltip: context.l10n.commonCreate,
                    callbackToken: hasWorkspace,
                    enabled: hasWorkspace,
                    onPressed: _showDriveActionsSheet,
                  ),
                if (currentFolderLabel != null && !selecting)
                  ShellActionSpec(
                    id: 'drive-breadcrumbs',
                    icon: LucideIcons.folderTree,
                    tooltip: context.l10n.driveFolderPath,
                    callbackToken: _path,
                    onPressed: _showBreadcrumbs,
                  ),
                if (!selecting && _canManageDrive)
                  ShellActionSpec(
                    id: 'drive-usage',
                    icon: LucideIcons.hardDrive,
                    tooltip: context.l10n.driveStorageUsage,
                    enabled: hasWorkspace && _canManageDrive,
                    onPressed: _showStorageUsage,
                  ),
                if (selecting)
                  ShellActionSpec(
                    id: 'drive-done-selecting',
                    icon: LucideIcons.x,
                    tooltip: context.l10n.commonDone,
                    onPressed: () => _update(_selectedNames.clear),
                  ),
                if (selecting && _canManageDrive)
                  ShellActionSpec(
                    id: 'drive-delete-selected',
                    icon: Icons.delete_outline_rounded,
                    tooltip: context.l10n.driveDeleteSelected(
                      _selectedNames.length,
                    ),
                    callbackToken: _selectedNames.length,
                    enabled: hasWorkspace && _selectedNames.isNotEmpty,
                    highlighted: _selectedNames.isNotEmpty,
                    onPressed: () => _deleteEntries(
                      _entries
                          .where((entry) => _selectedNames.contains(entry.name))
                          .toList(growable: false),
                    ),
                  ),
              ],
            ),
          NovaRefreshIndicator(
            onRefresh: _reload,
            child: AppPageListView(
              kind: _showGrid ? AppPageKind.root : AppPageKind.detail,
              controller: _scrollController,
              physics: const AlwaysScrollableScrollPhysics(),
              children: [
                if (_error case final message?)
                  AppStateMessage.inline(
                    icon: LucideIcons.circleAlert,
                    title: message,
                  ),
                if (_entries.isNotEmpty)
                  if (_showGrid)
                    _DriveGrid(
                      children: [
                        for (final entry in _entries)
                          _entryWidget(entry, grid: true),
                      ],
                    )
                  else
                    for (var index = 0; index < _entries.length; index++)
                      AppGroupedSlice(
                        position: AppSlicePosition.of(index, _entries.length),
                        dividerInset: AppLayout.rowHorizontalPadding,
                        child: _entryWidget(_entries[index], grid: false),
                      )
                else if (_isLoading)
                  const AppGroupedCard(children: [AppSkeletonRows(count: 6)])
                else if (_error == null)
                  AppStateMessage(
                    icon: LucideIcons.folder,
                    title: context.l10n.driveEmptyState,
                  ),
                if (_hasMore)
                  Center(
                    child: AppButton.outline(
                      onPressed: _isLoadingMore ? null : _loadMore,
                      child: Text(context.l10n.commonLoadMore),
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _backWithinDrive() async {
    if (_selectedNames.isNotEmpty) {
      _update(_selectedNames.clear);
    } else {
      _goUp();
    }
  }

  void _toggleSelection(DriveEntry entry) {
    _update(() {
      if (!_selectedNames.add(entry.name)) _selectedNames.remove(entry.name);
    });
  }

  Widget _entryWidget(DriveEntry entry, {required bool grid}) {
    final selecting = _selectedNames.isNotEmpty;
    return PendingSyncFrame(
      key: ValueKey(entry.name),
      workspaceId: _wsId ?? '',
      feature: 'drive',
      entityId: _path.isEmpty ? entry.name : '$_path/${entry.name}',
      child: _DriveEntryTile(
        entry: entry,
        grid: grid,
        selected: _selectedNames.contains(entry.name),
        selecting: selecting,
        onTap: selecting
            ? () => _toggleSelection(entry)
            : () => _openEntry(entry),
        onLongPress: () => _toggleSelection(entry),
        onMenu: () => _showEntryActions(entry),
      ),
    );
  }

  Future<void> _showEntryActions(DriveEntry entry) async {
    final l10n = context.l10n;
    final token = _requestToken;
    final wsId = _wsId;
    final actorId = _actorId;
    if (wsId == null) return;
    final action = await showAppActionSheet<String>(
      context: context,
      title: entry.name,
      actions: [
        if (_canManageDrive)
          AppSheetAction(
            icon: LucideIcons.pencil,
            label: l10n.commonRename,
            value: 'rename',
          ),
        AppSheetAction(
          icon: LucideIcons.copy,
          label: l10n.driveCopyPath,
          value: 'copy',
        ),
        if (entry.isFolder)
          AppSheetAction(
            icon: LucideIcons.link,
            label: l10n.driveExportLinksTitle,
            value: 'export',
          )
        else ...[
          AppSheetAction(
            icon: LucideIcons.share2,
            label: l10n.commonShare,
            value: 'share',
          ),
          AppSheetAction(
            icon: LucideIcons.externalLink,
            label: l10n.commonOpen,
            value: 'open',
          ),
        ],
        if (_canManageDrive)
          AppSheetAction(
            icon: LucideIcons.trash,
            label: l10n.commonDelete,
            value: 'delete',
            tone: AppTone.destructive,
          ),
      ],
    );
    if (!_isCurrentRequest(token, wsId, actorId)) return;
    switch (action) {
      case 'rename':
        await _renameEntry(entry);
      case 'copy':
        await _copyEntryPath(entry);
      case 'export':
        await _showExportLinks(entry);
      case 'share':
        await _shareEntry(entry);
      case 'open':
        await _openExternal(entry);
      case 'delete':
        await _deleteEntries([entry]);
    }
  }
}
