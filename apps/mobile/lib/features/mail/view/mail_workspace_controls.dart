part of 'mail_page.dart';

extension _MailWorkspaceControls on _MailWorkspaceState {
  void _startMailSearch() {
    _updateState(() => _searchVisible = true);
    if (lookupShellTitleOverrideCubit(context) == null) {
      _searchFocus.requestFocus();
    }
  }

  Future<String?> _chooseMailOption(
    String title,
    Map<String, String> options,
    String? selected,
  ) => showAdaptiveSheet<String>(
    context: context,
    useRootNavigator: true,
    builder: (sheetContext) => AppDialogScaffold(
      title: title,
      child: Material(
        color: Colors.transparent,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            for (final option in options.entries)
              ListTile(
                leading: Icon(switch (option.key) {
                  'inbox' || '__inbox' => Icons.inbox_outlined,
                  'archive' || '__archive' => Icons.archive_outlined,
                  'trash' || '__trash' => Icons.delete_outline,
                  'snoozed' => Icons.snooze_outlined,
                  'muted' => Icons.volume_off_outlined,
                  'sent' => Icons.send_outlined,
                  'drafts' => Icons.drafts_outlined,
                  'starred' => Icons.star_outline,
                  'spam' => Icons.report_outlined,
                  '' => Icons.all_inbox_outlined,
                  _ when option.key.startsWith('label:') => Icons.label_outline,
                  _ when option.key.startsWith('folder:') =>
                    Icons.folder_outlined,
                  _ => Icons.mail_outline,
                }),
                title: Text(option.value),
                selected: selected == option.key,
                trailing: selected == option.key
                    ? const Icon(Icons.check)
                    : null,
                onTap: () => Navigator.of(sheetContext).pop(option.key),
              ),
          ],
        ),
      ),
    ),
  );

  Widget _pickerButton({
    required String label,
    required IconData icon,
    required VoidCallback onPressed,
  }) => IconButton(
    tooltip: label,
    onPressed: _mutating ? null : onPressed,
    icon: Row(
      mainAxisSize: MainAxisSize.min,
      children: [Icon(icon, size: 22), const Icon(Icons.expand_more, size: 16)],
    ),
  );

  Future<void> _chooseMailbox() async {
    final l10n = context.l10n;
    final value = await _chooseMailOption(l10n.mailMailbox, {
      for (final box in _mailboxes)
        box['id'] as String: box['address'] as String,
    }, _mailboxId);
    if (!mounted || value == null || value == _mailboxId) return;
    _flushAllDeferredFeedback();
    _dismissSwipeFeedback();
    _updateState(() {
      _mailboxId = value;
      _labelId = null;
      _folderId = null;
      _quickFilter = MailQuickFilter.all;
      _selected.clear();
      // An open conversation belongs to the previous mailbox.
      _selection = null;
    });
    unawaited(_load(forceRefresh: false));
  }

  Future<void> _chooseFilter() async {
    final l10n = context.l10n;
    final value = await _chooseMailOption(
      l10n.mailLabels,
      {
        '': l10n.mailAllLabels,
        for (final label in _labels)
          'label:${label['id']}': label['name'] as String,
        for (final folder in _folders)
          'folder:${folder['id']}': folder['name'] as String,
      },
      _labelId != null
          ? 'label:$_labelId'
          : _folderId != null
          ? 'folder:$_folderId'
          : '',
    );
    if (!mounted || value == null) return;
    final nextLabelId = value.startsWith('label:') ? value.substring(6) : null;
    final nextFolderId = value.startsWith('folder:')
        ? value.substring(7)
        : null;
    if (nextLabelId == _labelId && nextFolderId == _folderId) return;
    _dismissSwipeFeedback();
    _updateState(() {
      _labelId = nextLabelId;
      _folderId = nextFolderId;
      _selected.clear();
    });
    unawaited(_load(forceRefresh: false));
  }

  void _setQuickFilter(MailQuickFilter filter) {
    if (filter == _quickFilter) return;
    _dismissSwipeFeedback();
    _updateState(() {
      _quickFilter = filter;
      _selected.clear();
    });
    unawaited(_load(forceRefresh: false));
  }

  Widget _buildMailControls(
    Widget folderPicker,
    bool sharedShell, {
    required bool showPickers,
    required bool showCompose,
  }) {
    final l10n = context.l10n;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (showPickers)
          Row(
            children: [
              folderPicker,
              _pickerButton(
                label: l10n.mailMailbox,
                icon: Icons.alternate_email,
                onPressed: _chooseMailbox,
              ),
              _pickerButton(
                label: l10n.mailLabels,
                icon: Icons.filter_alt_outlined,
                onPressed: _chooseFilter,
              ),
              if (!sharedShell)
                IconButton(
                  tooltip: l10n.mailSearch,
                  onPressed: showCompose
                      ? (_searchVisible ? _closeShellSearch : _startMailSearch)
                      : () => _updateState(
                          () => _searchVisible = !_searchVisible,
                        ),
                  icon: const Icon(AppIcons.search),
                ),
              if (showCompose && _canSend)
                IconButton(
                  tooltip: l10n.mailCompose,
                  onPressed: _mutating ? null : _compose,
                  icon: const Icon(Icons.edit_outlined),
                ),
            ],
          ),
        if (_folder != 'drafts')
          Padding(
            padding: const EdgeInsets.only(top: AppSpacing.xs),
            child: MailQuickFilterBar(
              value: _quickFilter,
              enabled: !_mutating && _mailboxId != null,
              onChanged: _setQuickFilter,
            ),
          ),
        AnimatedSize(
          duration: const Duration(milliseconds: 220),
          reverseDuration: const Duration(milliseconds: 220),
          curve: Curves.easeInOutCubic,
          child: !sharedShell && (_searchVisible || _search.text.isNotEmpty)
              ? TextField(
                  controller: _search,
                  focusNode: _searchFocus,
                  textInputAction: TextInputAction.search,
                  decoration: InputDecoration(
                    hintText: l10n.mailSearch,
                    isDense: true,
                    prefixIcon: const Icon(AppIcons.search),
                    suffixIcon: IconButton(
                      tooltip: l10n.commonCancel,
                      icon: const Icon(Icons.close),
                      onPressed: () {
                        _searchDebounce?.cancel();
                        _search.clear();
                        _searchFocus.unfocus();
                        _updateState(() => _searchVisible = false);
                        unawaited(_load(forceRefresh: false));
                      },
                    ),
                  ),
                  onChanged: (_) {
                    _searchDebounce?.cancel();
                    _searchDebounce = Timer(
                      const Duration(milliseconds: 300),
                      () => unawaited(_load(forceRefresh: false)),
                    );
                  },
                  onSubmitted: (_) {
                    _searchDebounce?.cancel();
                    unawaited(_load());
                  },
                )
              : const SizedBox.shrink(),
        ),
      ],
    );
  }

  /// The folder (or the label or custom folder filtering it) the list shows.
  String _mailListTitle(AppLocalizations l10n) {
    String? nameOf(List<Map<String, dynamic>> rows, String? id) => id == null
        ? null
        : rows.firstWhere(
                (row) => row['id'] == id,
                orElse: () => const <String, dynamic>{},
              )['name']
              as String?;
    return nameOf(_labels, _labelId) ??
        nameOf(_folders, _folderId) ??
        _mailSystemFolders(l10n)[_folder] ??
        l10n.mailFolders;
  }

  Widget _buildMailListHeader() {
    final l10n = context.l10n;
    final markRead =
        _mailboxId != null && ['inbox', 'archive'].contains(_folder);
    return MailListHeader(
      title: _mailListTitle(l10n),
      address: _mailbox['address'] as String?,
      syncState: _loading
          ? MailSyncState.syncing
          : _failed
          ? MailSyncState.failed
          : MailSyncState.synced,
      onRefresh: () => unawaited(!_accessVerified ? _bootstrap() : _load()),
      markReadTooltip: !markRead
          ? null
          : _folder == 'inbox'
          ? l10n.mailMarkInboxRead
          : l10n.mailMarkArchiveRead,
      onMarkRead: markRead && !_mutating ? _markAllRead : null,
    );
  }
}
