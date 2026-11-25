part of 'mail_page.dart';

double _mailSidebarWidth(double bodyWidth) {
  const split = AppMasterDetailLayout.splitMinWidth;
  if (bodyWidth >= split + 193) return 192;
  if (bodyWidth >= split + 57) return 56;
  return 0;
}

/// Web Mail's system folders, in its sidebar order.
Map<String, String> _mailSystemFolders(AppLocalizations l10n) => {
  'inbox': l10n.mailInbox,
  'snoozed': l10n.mailSnoozed,
  'muted': l10n.mailMuted,
  'starred': l10n.mailStarred,
  'sent': l10n.mailSent,
  'drafts': l10n.mailDrafts,
  'archive': l10n.mailArchive,
  'spam': l10n.mailSpam,
  'blocked': l10n.mailBlocked,
  'trash': l10n.mailTrash,
};

IconData _mailFolderIcon(String folder) => switch (folder) {
  'starred' => Icons.star_outline,
  'drafts' => Icons.drafts_outlined,
  'sent' => Icons.send_outlined,
  'archive' => Icons.archive_outlined,
  'spam' => Icons.report_outlined,
  'blocked' => Icons.block_outlined,
  'trash' => Icons.delete_outline,
  'snoozed' => Icons.snooze_outlined,
  'muted' => Icons.volume_off_outlined,
  _ => Icons.inbox_outlined,
};

extension _MailWorkspaceSidebar on _MailWorkspaceState {
  /// Inbox's unread count from the mailbox summary, when the server sent it.
  int? _mailFolderCount(String folder) {
    final count = _mailbox['unreadCount'];
    return folder == 'inbox' && count is int && count > 0 ? count : null;
  }

  List<ShellMiniNavItemSpec> _mailRailItems(Map<String, String> folders) {
    final l10n = context.l10n;
    final enabled = !_mutating;
    return [
      if (_canSend)
        ShellMiniNavItemSpec(
          id: 'compose',
          label: l10n.mailCompose,
          icon: Icons.edit_outlined,
          enabled: enabled,
          onPressed: _compose,
        ),
      ShellMiniNavItemSpec(
        id: 'mailbox',
        label: _mailbox['address'] as String? ?? l10n.mailMailbox,
        icon: Icons.alternate_email,
        dropdown: true,
        enabled: _mailboxes.isNotEmpty && enabled,
        callbackToken: _mailboxId,
        onPressed: _chooseMailbox,
      ),
      ShellMiniNavItemSpec(
        id: 'section-folders',
        label: l10n.mailFolders,
        icon: Icons.folder_outlined,
        heading: true,
        expanded: _foldersExpanded,
        callbackToken: _foldersExpanded,
        onPressed: () =>
            _updateState(() => _foldersExpanded = !_foldersExpanded),
      ),
      if (_foldersExpanded) ...[
        for (final folder in folders.entries)
          ShellMiniNavItemSpec(
            id: 'folder-${folder.key}',
            label: folder.value,
            icon: _mailFolderIcon(folder.key),
            enabled: enabled,
            selected: _isMailFolderSelected(folder.key),
            count: _mailFolderCount(folder.key),
            callbackToken: folder.key,
            onPressed: () => _selectFolder(folder.key),
          ),
        for (final folder in _folders)
          ShellMiniNavItemSpec(
            id: 'custom-folder-${folder['id']}',
            label: folder['name'] as String? ?? '',
            icon: Icons.folder_outlined,
            enabled: enabled,
            selected: _folderId == folder['id'],
            callbackToken: folder['id'],
            onPressed: () =>
                _applyMailFilter(folderId: folder['id'] as String?),
          ),
      ],
      if (_labels.isNotEmpty) ...[
        ShellMiniNavItemSpec(
          id: 'section-labels',
          label: l10n.mailLabels,
          icon: LucideIcons.tag,
          heading: true,
          expanded: _labelsExpanded,
          count: _labels.length,
          callbackToken: _labelsExpanded,
          onPressed: () =>
              _updateState(() => _labelsExpanded = !_labelsExpanded),
        ),
        if (_labelsExpanded)
          for (final label in _labels)
            ShellMiniNavItemSpec(
              id: 'label-${label['id']}',
              label: label['name'] as String? ?? '',
              icon: LucideIcons.tag,
              dotColor: mailLabelColor(context, label),
              enabled: enabled,
              selected: _labelId == label['id'],
              callbackToken: label['id'],
              onPressed: () =>
                  _applyMailFilter(labelId: label['id'] as String?),
            ),
      ],
    ];
  }

  bool _isMailFolderSelected(String folder) =>
      _folder == folder && _folderId == null && _labelId == null;

  void _selectFolder(String folder) {
    if (_mutating ||
        (_folder == folder && _folderId == null && _labelId == null)) {
      return;
    }
    _flushAllDeferredFeedback();
    _dismissSwipeFeedback();
    _updateState(() {
      _folder = folder;
      _labelId = null;
      _folderId = null;
      _quickFilter = MailQuickFilter.all;
      _selected.clear();
      if (usesMailActionBar(context)) _selection = null;
    });
    unawaited(_load(forceRefresh: false));
  }

  Widget _buildMailSidebar(Map<String, String> folders, double width) {
    final l10n = context.l10n;
    final labelled = width > 56;
    final colors = AppTokens.of(context).colorScheme;
    final mailboxLabel = _mailbox['address'] as String? ?? l10n.mailMailbox;
    final onMailbox = _mailboxes.isEmpty || _mutating ? null : _chooseMailbox;
    Widget iconButton({
      required String label,
      required IconData icon,
      required VoidCallback? onTap,
      bool selected = false,
    }) => Semantics(
      selected: selected,
      child: Align(
        child: IconButton(
          tooltip: label,
          onPressed: onTap,
          isSelected: selected,
          selectedIcon: Icon(icon, color: colors.primary),
          icon: Icon(icon),
        ),
      ),
    );
    final padding = EdgeInsets.fromLTRB(
      labelled ? 8 : 0,
      AppSpacing.sm,
      labelled ? 8 : 0,
      AppPageInsets.contentBottomClearance(context) + AppSpacing.sm,
    );
    if (!labelled) {
      // The narrow rail keeps icons only, as web's collapsed sidebar.
      return FocusTraversalGroup(
        child: ListView(
          key: const ValueKey('mail-folder-sidebar'),
          primary: false,
          padding: padding,
          children: [
            if (_canSend)
              iconButton(
                label: l10n.mailCompose,
                icon: Icons.edit_outlined,
                onTap: _mutating ? null : _compose,
              ),
            iconButton(
              label: mailboxLabel,
              icon: Icons.alternate_email,
              onTap: onMailbox,
            ),
            for (final folder in folders.entries)
              iconButton(
                label: '${l10n.mailFolders} · ${folder.value}',
                icon: _mailFolderIcon(folder.key),
                selected: _isMailFolderSelected(folder.key),
                onTap: _mutating ? null : () => _selectFolder(folder.key),
              ),
            if (_folders.isNotEmpty || _labels.isNotEmpty)
              iconButton(
                label: l10n.mailLabels,
                icon: Icons.filter_alt_outlined,
                selected: _labelId != null || _folderId != null,
                onTap: _mutating ? null : _chooseFilter,
              ),
          ],
        ),
      );
    }
    VoidCallback? rowTap(VoidCallback action) => _mutating ? null : action;
    return FocusTraversalGroup(
      child: ListView(
        key: const ValueKey('mail-folder-sidebar'),
        primary: false,
        padding: padding,
        children: [
          if (_canSend)
            Padding(
              padding: const EdgeInsets.only(bottom: AppSpacing.sm),
              child: AppButton.primary(
                leading: const Icon(Icons.edit_outlined, size: 18),
                onPressed: _mutating ? null : _compose,
                child: Text(l10n.mailCompose),
              ),
            ),
          AppTooltip(
            message: mailboxLabel,
            excludeFromSemantics: true,
            child: MailSidebarRow(
              label: mailboxLabel,
              icon: Icons.alternate_email,
              onTap: onMailbox,
            ),
          ),
          const SizedBox(height: AppSpacing.xs),
          MailSidebarHeading(
            key: const ValueKey('mail-section-folders'),
            label: l10n.mailFolders,
            expanded: _foldersExpanded,
            onToggle: () =>
                _updateState(() => _foldersExpanded = !_foldersExpanded),
          ),
          if (_foldersExpanded) ...[
            for (final folder in folders.entries)
              MailSidebarRow(
                key: ValueKey('mail-folder-${folder.key}'),
                label: folder.value,
                icon: _mailFolderIcon(folder.key),
                count: _mailFolderCount(folder.key),
                selected: _isMailFolderSelected(folder.key),
                onTap: rowTap(() => _selectFolder(folder.key)),
              ),
            for (final folder in _folders)
              MailSidebarRow(
                key: ValueKey('mail-custom-folder-${folder['id']}'),
                label: folder['name'] as String? ?? '',
                icon: Icons.folder_outlined,
                selected: _folderId == folder['id'],
                onTap: rowTap(
                  () => _applyMailFilter(folderId: folder['id'] as String?),
                ),
              ),
          ],
          MailSidebarHeading(
            key: const ValueKey('mail-section-labels'),
            label: l10n.mailLabels,
            count: _labels.length,
            expanded: _labelsExpanded,
            onToggle: () =>
                _updateState(() => _labelsExpanded = !_labelsExpanded),
          ),
          if (_labelsExpanded) ...[
            for (final label in _labels)
              MailSidebarRow(
                key: ValueKey('mail-label-${label['id']}'),
                label: label['name'] as String? ?? '',
                dotColor: mailLabelColor(context, label),
                selected: _labelId == label['id'],
                onTap: rowTap(
                  () => _applyMailFilter(labelId: label['id'] as String?),
                ),
              ),
            if (_labels.isEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: 10,
                  vertical: AppSpacing.sm,
                ),
                child: Text(
                  l10n.mailNoCustomLabels,
                  style: AppTokens.of(
                    context,
                  ).typography.xSmall.copyWith(color: colors.mutedForeground),
                ),
              ),
          ],
        ],
      ),
    );
  }
}
