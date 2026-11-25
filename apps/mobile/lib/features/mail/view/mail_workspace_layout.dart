part of 'mail_page.dart';

extension _MailWorkspaceLayout on _MailWorkspaceState {
  Widget _buildWorkspace(BuildContext context) => LayoutBuilder(
    builder: (context, constraints) =>
        _buildWorkspaceBody(context, constraints.maxWidth),
  );

  Widget _buildWorkspaceBody(BuildContext context, double bodyWidth) {
    final l10n = context.l10n;
    final folders = {
      'inbox': l10n.mailInbox,
      'snoozed': l10n.mailSnoozed,
      'muted': l10n.mailMuted,
      'sent': l10n.mailSent,
      'drafts': l10n.mailDrafts,
      'starred': l10n.mailStarred,
      'archive': l10n.mailArchive,
      'spam': l10n.mailSpam,
      'trash': l10n.mailTrash,
    };
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
    final shellSidebar = rail && sharedShell;
    final sidebarWidth = wide && !shellSidebar
        ? _mailSidebarWidth(bodyWidth)
        : 0.0;
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
                title: l10n.mailInbox,
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
                  else ...[
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
              backgroundColor: shad.Theme.of(context).colorScheme.background,
              appBar: sharedShell
                  ? null
                  : AppBar(
                      title: hasSidebar
                          ? Text(folders[_folder] ?? l10n.mailFolders)
                          : folderPicker,
                      actions: [
                        if (hasSidebar)
                          IconButton(
                            tooltip: l10n.mailSearch,
                            onPressed: _startMailSearch,
                            icon: const Icon(AppIcons.search),
                          ),
                        if (_mailboxId != null &&
                            ['inbox', 'archive'].contains(_folder))
                          IconButton(
                            tooltip: l10n.mailMarkAllRead,
                            onPressed: _mutating ? null : _markAllRead,
                            icon: const Icon(Icons.mark_email_read_outlined),
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
    return AppMasterDetail(
      detail: _buildDetailPane(),
      detailKey: _activeSelection?.id,
      onSplitChanged: _onSplitChanged,
      onCloseDetail: _closeSelection,
      emptyDetail: AppMasterDetailEmpty(
        icon: Icons.mark_email_read_outlined,
        title: l10n.mailPreviewEmptyTitle,
        message: l10n.mailPreviewEmptyMessage,
      ),
      master: Column(
        children: [
          if (wide && _selected.isNotEmpty) _buildMailBulkToolbar(),
          Expanded(
            child: _buildConversationList(
              sharedShell: sharedShell,
              wide: wide,
              hasSidebar: hasSidebar,
              folderPicker: folderPicker,
            ),
          ),
        ],
      ),
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
                      onRetry: () => unawaited(
                        !_accessVerified ? _bootstrap() : _load(),
                      ),
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
                  sliver: SliverList.separated(
                    itemCount: _items.length + 1,
                    separatorBuilder: (_, index) =>
                        const Divider(height: 1, indent: 32),
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
