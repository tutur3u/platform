part of 'mail_page.dart';

extension _MailWorkspaceLayout on _MailWorkspaceState {
  Widget _buildWorkspace(BuildContext context) => LayoutBuilder(
    builder: (context, constraints) =>
        _buildWorkspaceBody(context, constraints.maxWidth),
  );

  Widget _buildWorkspaceBody(BuildContext context, double bodyWidth) {
    final l10n = context.l10n;
    final folders = _mailSystemFolders(l10n);
    final sharedShell = lookupShellTitleOverrideCubit(context) != null;
    Future<void> chooseFolder() async {
      final folder = await _chooseMailOption(
        l10n.mailFolders,
        folders,
        _folder,
      );
      if (mounted && folder != null && folder != _folder) _selectFolder(folder);
    }

    final wide = usesMailActionBar(context);
    final rail =
        shellNavigationModeFor(MediaQuery.sizeOf(context)) ==
        ShellNavigationMode.rail;
    final sidebarWidth = wide ? _mailSidebarWidth(bodyWidth) : 0.0;
    final shellSidebar = rail && sharedShell && sidebarWidth == 0;
    final hasSidebar = sidebarWidth > 0;
    final folderPicker = _pickerButton(
      label: folders[_folder] ?? l10n.mailFolders,
      icon: _mailFolderIcon(_folder),
      onPressed: chooseFolder,
    );
    final paneOpen = _split && _activeSelection != null;
    return _withMailKeyboard(
      context,
      PopScope(
        canPop: !paneOpen,
        onPopInvokedWithResult: (didPop, _) {
          if (!didPop) _closeSelection();
        },
        child: Stack(
          fit: StackFit.expand,
          children: [
            if (sharedShell && !_childRouteOpen) ...[
              ShellTitleOverride(
                ownerId: 'mail-inbox',
                locations: const {Routes.mail},
                title: wide ? l10n.mailTitle : _mailListTitle(l10n),
              ),
              _buildMailShellActions(
                wide: wide,
                onBack: paneOpen ? _onPaneBack : null,
              ),
              ShellMiniNav(
                ownerId: 'mail-navigation',
                locations: const {Routes.mail},
                deepLinkBackRoute: Routes.apps,
                items: [
                  ShellMiniNavItemSpec(
                    id: 'back',
                    icon: Icons.chevron_left,
                    label: l10n.navBack,
                  ),
                  if (shellSidebar)
                    ..._mailRailItems(folders)
                  else if (!hasSidebar) ...[
                    ShellMiniNavItemSpec(
                      id: 'folder',
                      icon: _mailFolderIcon(_folder),
                      label: folders[_folder] ?? l10n.mailFolders,
                      selected: true,
                      dropdown: true,
                      callbackToken: _folder,
                      onPressed: chooseFolder,
                    ),
                    ShellMiniNavItemSpec(
                      id: 'mailbox',
                      icon: Icons.alternate_email,
                      label: _mailbox['address'] as String? ?? l10n.mailMailbox,
                      dropdown: true,
                      enabled: _mailboxes.isNotEmpty,
                      callbackToken: _mailboxId,
                      onPressed: _chooseMailbox,
                    ),
                    ShellMiniNavItemSpec(
                      id: 'filter',
                      icon: _labelId != null || _folderId != null
                          ? Icons.filter_alt
                          : Icons.filter_alt_outlined,
                      label: l10n.mailLabels,
                      dropdown: true,
                      callbackToken: (_labelId, _folderId),
                      onPressed: _chooseFilter,
                    ),
                  ],
                ],
              ),
            ],
            Scaffold(
              backgroundColor: sharedShell
                  ? Colors.transparent
                  : AppTokens.of(context).colorScheme.background,
              appBar: sharedShell
                  ? null
                  : AppBar(
                      title: hasSidebar ? Text(l10n.mailTitle) : folderPicker,
                      actions: [
                        if (hasSidebar)
                          IconButton(
                            tooltip: l10n.mailSearch,
                            onPressed: _startMailSearch,
                            icon: const Icon(AppIcons.search),
                          ),
                        if (_mailboxId != null)
                          IconButton(
                            tooltip: l10n.mailSettings,
                            onPressed: _mutating ? null : _manage,
                            icon: const Icon(Icons.settings_outlined),
                          ),
                      ],
                    ),
              floatingActionButton:
                  !wide &&
                      !sharedShell &&
                      _mailboxId != null &&
                      _canSend &&
                      !_searchFocus.hasFocus
                  ? FloatingActionButton.extended(
                      onPressed: _mutating ? null : _compose,
                      icon: const Icon(Icons.edit_outlined),
                      label: Text(l10n.mailCompose),
                    )
                  : null,
              body: Column(
                children: [
                  Expanded(
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        if (hasSidebar) ...[
                          SizedBox(
                            width: sidebarWidth,
                            child: _buildMailSidebar(folders, sidebarWidth),
                          ),
                          const VerticalDivider(width: 1, thickness: 1),
                        ],
                        Expanded(
                          child: _buildMasterDetail(
                            sharedShell: sharedShell,
                            wide: wide,
                            hasSidebar: hasSidebar || shellSidebar,
                            folderPicker: folderPicker,
                          ),
                        ),
                      ],
                    ),
                  ),
                  _buildWideFeedback(),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildMasterDetail({
    required bool sharedShell,
    required bool wide,
    required bool hasSidebar,
    required Widget folderPicker,
  }) {
    final l10n = context.l10n;
    final splitPreference = MailPaneSplitPreference.instance;
    unawaited(splitPreference.load());
    final list = Column(
      children: [
        if (wide && _selected.isNotEmpty) _buildMailBulkToolbar(),
        Expanded(
          child: NotificationListener<ScrollNotification>(
            onNotification: _onConversationScroll,
            child: _buildConversationList(
              sharedShell: sharedShell,
              wide: wide,
              hasSidebar: hasSidebar,
              folderPicker: folderPicker,
            ),
          ),
        ),
      ],
    );
    return ValueListenableBuilder<double>(
      valueListenable: splitPreference,
      builder: (context, fraction, master) => AppMasterDetail(
        detail: _buildDetailPane(),
        detailKey: _activeSelection?.id,
        onSplitChanged: _onSplitChanged,
        onCloseDetail: _closeSelection,
        emptyDetail: AppMasterDetailEmpty(
          icon: Icons.mark_email_read_outlined,
          title: l10n.mailPreviewEmptyTitle,
          message: l10n.mailPreviewEmptyMessage,
        ),
        split: AppMasterDetailSplit(
          bounds: mailPaneSplitBounds,
          fraction: fraction,
          semanticLabel: l10n.mailPaneResize,
          onChanged: (value, {required persist}) =>
              unawaited(splitPreference.select(value, persist: persist)),
          onReset: () => unawaited(splitPreference.reset()),
        ),
        master: master!,
      ),
      child: wide && hasSidebar
          ? Padding(
              padding: const EdgeInsets.all(AppSpacing.sm),
              child: AppCard(padding: EdgeInsets.zero, child: list),
            )
          : list,
    );
  }

  Widget _buildConversationList({
    required bool sharedShell,
    required bool wide,
    required bool hasSidebar,
    required Widget folderPicker,
  }) {
    final l10n = context.l10n;
    return NovaRefreshIndicator(
      onRefresh: () async {
        if (!_mutating) await _load();
      },
      child: CustomScrollView(
        key: const ValueKey('mail-conversations'),
        controller: _conversationScroll,
        physics: const AlwaysScrollableScrollPhysics(),
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        slivers: [
          SliverAppPage(
            includeBottom: false,
            sliver: SliverToBoxAdapter(
              child: Column(
                children: [
                  _buildMailListHeader(showTitle: wide || !sharedShell),
                  Padding(
                    padding: const EdgeInsets.only(bottom: AppSpacing.sm),
                    child: _buildMailControls(
                      folderPicker,
                      sharedShell,
                      showPickers: !hasSidebar && (!sharedShell || wide),
                      showCompose: wide && !hasSidebar,
                    ),
                  ),
                  if (!wide && _selected.isNotEmpty) _buildMailBulkToolbar(),
                  if (_failed && _listResolved)
                    MailRefreshNotice(
                      onRetry: () =>
                          unawaited(!_accessVerified ? _bootstrap() : _load()),
                    ),
                ],
              ),
            ),
          ),
          if (_items.isEmpty && _loading && !_listResolved)
            SliverToBoxAdapter(
              child: Semantics(
                label: l10n.commonLoading,
                child: const MailInboxSkeleton(),
              ),
            )
          else if (_items.isEmpty)
            SliverAppPage(
              includeTop: false,
              sliver: SliverFillRemaining(
                hasScrollBody: false,
                child: MailListEmptyState(
                  failed: _failed && !_listResolved,
                  timedOut: _failedTimeout,
                  onRetry: () =>
                      unawaited(!_accessVerified ? _bootstrap() : _load()),
                ),
              ),
            )
          else
            // Swipe rows stay edge-to-edge on phones; wider windows
            // centre them at the detail width instead of stretching.
            SliverLayoutBuilder(
              builder: (context, constraints) {
                final width = constraints.crossAxisExtent;
                final page = AppPageInsets.of(context, width: width);
                final gutter = AppLayout.gutter(Breakpoints.fromWidth(width));
                return SliverPadding(
                  padding: EdgeInsets.fromLTRB(
                    page.left - gutter,
                    0,
                    page.right - gutter,
                    (sharedShell ? AppLayout.scrollEndGap : 100) +
                        MediaQuery.paddingOf(context).bottom,
                  ),
                  // Rounded rows with accent fills, a hairline apart, in
                  // place of divider lines.
                  sliver: SliverList.separated(
                    itemCount: _items.length + 1,
                    separatorBuilder: (_, index) => const SizedBox(height: 2),
                    itemBuilder: (context, index) {
                      if (index == _items.length) {
                        if (_hasMore) {
                          return TextButton(
                            onPressed: _loading
                                ? null
                                : () => _load(more: true),
                            child: Text(l10n.mailLoadMore),
                          );
                        }
                        return const SizedBox.shrink();
                      }
                      final item = _items[index];
                      final keyboardActive =
                          _keyboardListKey == _visibleListKey &&
                          _keyboardRowId == item['id'];
                      return _MailRowVisibility(
                        key: ValueKey(item['id']),
                        id: item['id'] as String,
                        ensureVisible: keyboardActive,
                        onChanged: _rowVisibilityChanged,
                        child: _MailRowFrame(
                          child: MailSwipeTile(
                            key: ValueKey(item['id']),
                            id: item['id'] as String,
                            preferences: _swipePreferences,
                            enabled:
                                !_mutating &&
                                _accessVerified &&
                                _selected.isEmpty &&
                                _folder != 'drafts',
                            onAction: (action) => _swipeMessage(item, action),
                            child: MailMessageTile(
                              item: item,
                              folder: _folder,
                              desktop: wide,
                              keyboardActive: keyboardActive,
                              workspaceId: widget.workspaceId,
                              thread: _threads,
                              active:
                                  _split && _activeSelection?.id == item['id'],
                              selected: _selected.contains(item['id']),
                              onSelect: () =>
                                  _toggleSelection(item['id'] as String),
                              onPressStart: () => _warmPreview(item),
                              onTap: () {
                                if (_mutating) return;
                                if (_keyboardRowId != null) {
                                  _updateState(() => _keyboardRowId = null);
                                }
                                if (_selected.isEmpty) {
                                  unawaited(_open(item));
                                } else {
                                  _toggleSelection(item['id'] as String);
                                }
                              },
                            ),
                          ),
                        ),
                      );
                    },
                  ),
                );
              },
            ),
        ],
      ),
    );
  }
}

/// Insets a row from the list edge and clips its swipe background to the
/// row's rounded shape.
class _MailRowFrame extends StatelessWidget {
  const _MailRowFrame({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(horizontal: AppSpacing.xs),
    child: ClipRRect(borderRadius: MailMessageTile.radius, child: child),
  );
}
