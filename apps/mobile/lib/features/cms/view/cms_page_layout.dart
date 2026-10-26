part of 'cms_page.dart';

extension _CmsPageLayout on _CmsPageState {
  Widget _buildWorkspace(BuildContext context) {
    final l10n = context.l10n;
    return AppScaffold(
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
                icon: LucideIcons.layoutDashboard,
                label: l10n.cmsOverview,
                callbackToken: _section,
                selected: _section == 0,
                onPressed: () => _updateState(() => _section = 0),
              ),
              ShellMiniNavItemSpec(
                id: 'cms-library',
                icon: LucideIcons.libraryBig,
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
                  icon: LucideIcons.search,
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
                icon: LucideIcons.refreshCw,
                tooltip: l10n.commonRefresh,
                callbackToken: _isLoading,
                enabled: !_isLoading,
                onPressed: () => _reload(force: true),
              ),
              if (!_denied)
                ShellActionSpec(
                  id: 'cms-new-collection',
                  icon: LucideIcons.folderPlus,
                  tooltip: l10n.cmsNewCollection,
                  callbackToken: widget.workspaceId,
                  onPressed: _showCollectionEditor,
                ),
              if (!_denied && _collections.isNotEmpty)
                ShellActionSpec(
                  id: 'cms-new-entry',
                  icon: LucideIcons.plus,
                  tooltip: l10n.cmsNewEntry,
                  highlighted: true,
                  callbackToken: _collections.length,
                  onPressed: _showEntryEditor,
                ),
            ],
          ),
          NovaRefreshIndicator(
            onRefresh: () => _reload(force: true),
            child: _section == 0
                ? AppPageListView(
                    key: ValueKey(('overview', widget.actorId, _wsId)),
                    kind: AppPageKind.root,
                    physics: const AlwaysScrollableScrollPhysics(),
                    children: _overviewChildren(context),
                  )
                : _buildLibrary(context),
          ),
        ],
      ),
    );
  }

  bool get _hasData =>
      _summary != null || _collections.isNotEmpty || _entries.isNotEmpty;

  /// First-load skeleton, access and failure states shared by both sections.
  /// Returns null when the section should render its content.
  Widget? _statusBlock(BuildContext context) {
    final l10n = context.l10n;
    if (_isLoading && !_hasData && _error == null) {
      return const CmsLoadingSkeleton();
    }
    if (_denied) {
      return AppStateMessage(
        icon: LucideIcons.lock,
        title: l10n.cmsNoAccess,
        message: _error,
      );
    }
    if (_error != null && !_hasData) {
      return AppStateMessage(
        icon: LucideIcons.cloudAlert,
        tone: AppTone.destructive,
        title: l10n.cmsLoadFailed,
        message: _error,
        actionLabel: l10n.commonRetry,
        onAction: _isLoading ? null : () => _reload(force: true),
      );
    }
    return null;
  }

  /// Inline notice above content that is still usable after a failed
  /// refresh.
  Widget? _refreshNotice(BuildContext context) {
    final error = _error;
    if (error == null || _denied || !_hasData) return null;
    return Padding(
      padding: const EdgeInsets.only(bottom: AppLayout.sectionGap),
      child: AppGroupedCard(
        children: [
          AppStateMessage.inline(
            icon: LucideIcons.cloudAlert,
            tone: AppTone.destructive,
            title: context.l10n.cmsRefreshFailed,
            message: error,
            actionLabel: context.l10n.commonRetry,
            onAction: _isLoading ? null : () => _reload(force: true),
          ),
        ],
      ),
    );
  }
}
