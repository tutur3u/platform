part of 'mail_page.dart';

extension _MailShellActions on _MailWorkspaceState {
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
          id: 'mail-refresh',
          icon: Icons.refresh_rounded,
          tooltip: l10n.commonRefresh,
          enabled: !_loading && !_mutating,
          callbackToken: (_mailboxId, _folder, _loading, _mutating),
          onPressed: _mailboxId == null ? _bootstrap : _load,
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
        if (['owner', 'admin'].contains(_mailbox['role']))
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
