part of 'mail_page.dart';

extension _MailShellActions on _MailWorkspaceState {
  void _closeShellSearch() {
    _searchDebounce?.cancel();
    _search.clear();
    _updateState(() => _searchVisible = false);
    unawaited(_load(forceRefresh: false));
  }

  Widget _buildMailShellActions() {
    final l10n = context.l10n;
    return ShellChromeActions(
      ownerId: 'mail-workspace-actions',
      locations: const {Routes.mail},
      actions: [
        if (_mailboxId != null && _canSend)
          ShellActionSpec(
            id: 'mail-compose',
            inDock: true,
            icon: Icons.edit_outlined,
            tooltip: l10n.mailCompose,
            enabled: !_mutating,
            callbackToken: (_mailboxId, _mutating),
            onPressed: _compose,
          ),
        ShellActionSpec(
          id: 'mail-search',
          icon: Icons.search,
          tooltip: l10n.mailSearch,
          highlighted: _searchVisible,
          callbackToken: _searchVisible,
          searchController: _searchVisible ? _search : null,
          searchHint: l10n.mailSearch,
          onSearchChanged: (_) {
            _searchDebounce?.cancel();
            _searchDebounce = Timer(
              const Duration(milliseconds: 300),
              () => unawaited(_load(forceRefresh: false)),
            );
          },
          onCloseSearch: _closeShellSearch,
          onPressed: () {
            if (_searchVisible) {
              _closeShellSearch();
            } else {
              _updateState(() => _searchVisible = true);
            }
          },
        ),
        if (_mailboxId != null && ['inbox', 'archive'].contains(_folder))
          ShellActionSpec(
            id: 'mail-mark-read',
            icon: Icons.mark_email_read_outlined,
            tooltip: l10n.mailMarkAllRead,
            enabled: !_mutating,
            callbackToken: (_mailboxId, _folder, _mutating),
            onPressed: _markAllRead,
          ),
        if (_mailboxId != null)
          ShellActionSpec(
            id: 'mail-settings',
            icon: Icons.settings_outlined,
            tooltip: l10n.mailSettings,
            enabled: !_mutating,
            callbackToken: (_mailboxId, _mutating),
            onPressed: _manage,
          ),
      ],
    );
  }
}
