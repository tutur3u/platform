part of 'mail_page.dart';

extension _MailWorkspaceLayout on _MailWorkspaceState {
  Widget _buildWorkspace(BuildContext context) {
    final l10n = context.l10n;
    final folders = {
      'inbox': l10n.mailInbox,
      'sent': l10n.mailSent,
      'drafts': l10n.mailDrafts,
      'starred': l10n.mailStarred,
      'archive': l10n.mailArchive,
      'spam': l10n.mailSpam,
      'trash': l10n.mailTrash,
    };
    final sharedShell = lookupShellTitleOverrideCubit(context) != null;
    final folderPicker = PopupMenuButton<String>(
      tooltip: l10n.mailFolders,
      onSelected: (folder) {
        if (_folder == folder) return;
        _updateState(() {
          _folder = folder;
          _labelId = null;
          _folderId = null;
        });
        unawaited(_load(forceRefresh: false));
      },
      itemBuilder: (_) => [
        for (final folder in folders.entries)
          CheckedPopupMenuItem(
            value: folder.key,
            checked: _folder == folder.key,
            child: Text(folder.value),
          ),
      ],
      child: ConstrainedBox(
        constraints: const BoxConstraints(minHeight: 48),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(folders[_folder] ?? l10n.mailTitle),
            const SizedBox(width: 4),
            const Icon(Icons.expand_more, size: 20),
          ],
        ),
      ),
    );
    return Stack(
      fit: StackFit.expand,
      children: [
        if (sharedShell && !_childRouteOpen) _buildMailShellActions(),
        Scaffold(
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
                    if (['owner', 'admin'].contains(_mailbox['role']))
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
                      if (_loading) const NovaLoadingIndicator(size: 20),
                      if (_mutating) const NovaLoadingIndicator(size: 20),
                      if (_labels.isNotEmpty || _folders.isNotEmpty)
                        Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 16),
                          child: DropdownButton<String>(
                            value: _labelId != null
                                ? 'label:$_labelId'
                                : _folderId != null
                                ? 'folder:$_folderId'
                                : '',
                            isExpanded: true,
                            items: [
                              DropdownMenuItem(
                                value: '',
                                child: Text(l10n.mailAllLabels),
                              ),
                              for (final label in _labels)
                                DropdownMenuItem(
                                  value: 'label:${label['id']}',
                                  child: Text(label['name'] as String),
                                ),
                              for (final folder in _folders)
                                DropdownMenuItem(
                                  value: 'folder:${folder['id']}',
                                  child: Text(folder['name'] as String),
                                ),
                            ],
                            onChanged: (v) {
                              _updateState(() {
                                _labelId = v?.startsWith('label:') == true
                                    ? v!.substring(6)
                                    : null;
                                _folderId = v?.startsWith('folder:') == true
                                    ? v!.substring(7)
                                    : null;
                              });
                              unawaited(_load());
                            },
                          ),
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
                                          child: Text(l['name'] as String),
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
                      if (_failed)
                        TextButton.icon(
                          onPressed: _mailboxId == null ? _bootstrap : _load,
                          icon: const Icon(Icons.refresh),
                          label: Text(l10n.commonSomethingWentWrong),
                        ),
                    ],
                  ),
                ),
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
                        if (!_loading && !_failed && _items.isEmpty) {
                          return Padding(
                            padding: const EdgeInsets.all(32),
                            child: Center(child: Text(l10n.mailEmpty)),
                          );
                        }
                        return const SizedBox.shrink();
                      }
                      final item = _items[index];
                      return MailMessageTile(
                        key: ValueKey(item['id']),
                        loading: _openingId == item['id'],
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
