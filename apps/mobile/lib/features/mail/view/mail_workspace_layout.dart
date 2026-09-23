part of 'mail_page.dart';

extension _MailWorkspaceLayout on _MailWorkspaceState {
  Widget _buildWorkspace(BuildContext context) {
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
      if (!mounted || folder == null || folder == _folder) return;
      _dismissSwipeFeedback();
      _updateState(() {
        _folder = folder;
        _labelId = null;
        _folderId = null;
        _selected.clear();
      });
      unawaited(_load(forceRefresh: false));
    }

    final folderPicker = _pickerButton(
      label: folders[_folder] ?? l10n.mailFolders,
      icon: switch (_folder) {
        'starred' => Icons.star_outline,
        'drafts' => Icons.drafts_outlined,
        'sent' => Icons.send_outlined,
        'archive' => Icons.archive_outlined,
        'spam' => Icons.report_outlined,
        'trash' => Icons.delete_outline,
        _ => Icons.inbox_outlined,
      },
      onPressed: chooseFolder,
    );
    return Stack(
      fit: StackFit.expand,
      children: [
        if (sharedShell && !_childRouteOpen) ...[
          _buildMailShellActions(),
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
              ShellMiniNavItemSpec(
                id: 'folder',
                icon: switch (_folder) {
                  'starred' => Icons.star_outline,
                  'drafts' => Icons.drafts_outlined,
                  'sent' => Icons.send_outlined,
                  'archive' => Icons.archive_outlined,
                  'spam' => Icons.report_outlined,
                  'trash' => Icons.delete_outline,
                  _ => Icons.inbox_outlined,
                },
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
          ),
        ],
        Scaffold(
          backgroundColor: shad.Theme.of(context).colorScheme.background,
          appBar: sharedShell
              ? null
              : AppBar(
                  title: folderPicker,
                  actions: [
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
          body: NovaRefreshIndicator(
            onRefresh: () async {
              if (!_mutating) await _load();
            },
            child: CustomScrollView(
              physics: const AlwaysScrollableScrollPhysics(),
              keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
              slivers: [
                SliverToBoxAdapter(
                  child: Column(
                    children: [
                      Padding(
                        padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
                        child: _buildMailControls(folderPicker, sharedShell),
                      ),
                      if (_selected.isNotEmpty)
                        SingleChildScrollView(
                          scrollDirection: Axis.horizontal,
                          child: Row(
                            children: [
                              Padding(
                                padding: const EdgeInsets.all(8),
                                child: Text('${_selected.length}'),
                              ),
                              IconButton(
                                tooltip: l10n.mailSelectAll,
                                onPressed: () => _updateState(
                                  () => _selected.addAll(
                                    _items.map((i) => i['id'] as String),
                                  ),
                                ),
                                icon: const Icon(Icons.select_all),
                              ),
                              IconButton(
                                tooltip: l10n.mailArchive,
                                onPressed: () => _bulk('archive'),
                                icon: const Icon(Icons.archive_outlined),
                              ),
                              IconButton(
                                tooltip: l10n.mailTrash,
                                onPressed: () => _bulk('trash'),
                                icon: const Icon(Icons.delete_outline),
                              ),
                              IconButton(
                                tooltip: l10n.mailMarkAllRead,
                                onPressed: () => _bulk('mark_read'),
                                icon: const Icon(
                                  Icons.mark_email_read_outlined,
                                ),
                              ),
                              if (_labels.isNotEmpty)
                                PopupMenuButton<String>(
                                  tooltip: l10n.mailLabels,
                                  icon: const Icon(Icons.label_outline),
                                  onSelected: (id) =>
                                      _bulk('add_label', labelId: id),
                                  itemBuilder: (_) => _labels
                                      .map(
                                        (l) => PopupMenuItem(
                                          value: l['id'] as String,
                                          child: Row(
                                            children: [
                                              const Icon(Icons.label_outline),
                                              const SizedBox(width: 12),
                                              Text(l['name'] as String),
                                            ],
                                          ),
                                        ),
                                      )
                                      .toList(),
                                ),
                              IconButton(
                                tooltip: l10n.commonCancel,
                                onPressed: () => _updateState(_selected.clear),
                                icon: const Icon(Icons.close),
                              ),
                            ],
                          ),
                        ),
                      if (_failed && _items.isNotEmpty)
                        TextButton.icon(
                          onPressed: _mailboxId == null ? _bootstrap : _load,
                          icon: const Icon(Icons.refresh),
                          label: Text(l10n.commonSomethingWentWrong),
                        ),
                    ],
                  ),
                ),
                if (_items.isEmpty)
                  SliverFillRemaining(
                    hasScrollBody: false,
                    child: Center(
                      child: Padding(
                        padding: const EdgeInsets.all(24),
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            if (_loading)
                              const NovaLoadingIndicator(size: 24)
                            else
                              Icon(
                                _failed
                                    ? Icons.error_outline
                                    : Icons.inbox_outlined,
                                size: 32,
                              ),
                            const SizedBox(height: 12),
                            Text(
                              _loading
                                  ? l10n.commonLoading
                                  : _failed
                                  ? l10n.commonSomethingWentWrong
                                  : l10n.mailEmpty,
                              textAlign: TextAlign.center,
                            ),
                            if (_failed)
                              TextButton.icon(
                                onPressed: _mailboxId == null
                                    ? _bootstrap
                                    : _load,
                                icon: const Icon(Icons.refresh),
                                label: Text(l10n.commonRetry),
                              ),
                          ],
                        ),
                      ),
                    ),
                  )
                else
                  SliverPadding(
                    padding: EdgeInsets.only(
                      bottom:
                          (sharedShell ? 16 : 100) +
                          MediaQuery.paddingOf(context).bottom,
                    ),
                    sliver: SliverList.separated(
                      itemCount: _items.length + 1,
                      separatorBuilder: (_, index) =>
                          const Divider(height: 1, indent: 36),
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
                        return MailSwipeTile(
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
                            thread: _threads,
                            selected: _selected.contains(item['id']),
                            onSelect: () {
                              if (_mutating) return;
                              _updateState(() {
                                final id = item['id'] as String;
                                if (!_selected.remove(id)) _selected.add(id);
                              });
                            },
                            onTap: () {
                              if (_mutating) return;
                              if (_selected.isEmpty) {
                                unawaited(_open(item));
                              } else {
                                _updateState(() {
                                  final id = item['id'] as String;
                                  if (!_selected.remove(id)) _selected.add(id);
                                });
                              }
                            },
                          ),
                        );
                      },
                    ),
                  ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}
