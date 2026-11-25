part of 'mail_page.dart';

double _mailSidebarWidth(double bodyWidth) {
  const split = AppMasterDetailLayout.splitMinWidth;
  if (bodyWidth >= split + 193) return 192;
  if (bodyWidth >= split + 57) return 56;
  return 0;
}

IconData _mailFolderIcon(String folder) => switch (folder) {
  'starred' => Icons.star_outline,
  'drafts' => Icons.drafts_outlined,
  'sent' => Icons.send_outlined,
  'archive' => Icons.archive_outlined,
  'spam' => Icons.report_outlined,
  'trash' => Icons.delete_outline,
  'snoozed' => Icons.snooze_outlined,
  'muted' => Icons.volume_off_outlined,
  _ => Icons.inbox_outlined,
};

extension _MailWorkspaceSidebar on _MailWorkspaceState {
  List<ShellMiniNavItemSpec> _mailRailItems(Map<String, String> folders) {
    final l10n = context.l10n;
    return [
      if (_canSend)
        ShellMiniNavItemSpec(
          id: 'compose',
          label: l10n.mailCompose,
          icon: Icons.edit_outlined,
          enabled: !_mutating,
          onPressed: _compose,
        ),
      ShellMiniNavItemSpec(
        id: 'mailbox',
        label: _mailbox['address'] as String? ?? l10n.mailMailbox,
        icon: Icons.alternate_email,
        dropdown: true,
        enabled: _mailboxes.isNotEmpty && !_mutating,
        callbackToken: _mailboxId,
        onPressed: _chooseMailbox,
      ),
      for (final folder in folders.entries)
        ShellMiniNavItemSpec(
          id: 'folder-${folder.key}',
          label: folder.value,
          icon: _mailFolderIcon(folder.key),
          enabled: !_mutating,
          selected: _isMailFolderSelected(folder.key),
          callbackToken: folder.key,
          onPressed: () => _selectFolder(folder.key),
        ),
      if (_folders.isNotEmpty || _labels.isNotEmpty)
        ShellMiniNavItemSpec(
          id: 'filter',
          label: l10n.mailLabels,
          icon: Icons.filter_alt_outlined,
          dropdown: true,
          enabled: !_mutating,
          selected: _labelId != null || _folderId != null,
          callbackToken: (_labelId, _folderId),
          onPressed: _chooseFilter,
        ),
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
    final colors = Theme.of(context).colorScheme;
    Widget destination({
      required String label,
      required IconData icon,
      required VoidCallback? onTap,
      String? compactTooltip,
      bool selected = false,
    }) => Semantics(
      selected: selected,
      child: labelled
          ? ListTile(
              title: Text(label, maxLines: 1, overflow: TextOverflow.ellipsis),
              leading: Icon(icon, size: 20),
              horizontalTitleGap: 8,
              minLeadingWidth: 22,
              contentPadding: const EdgeInsets.symmetric(horizontal: 8),
              dense: true,
              selected: selected,
              selectedTileColor: colors.secondaryContainer,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(8),
              ),
              onTap: onTap,
            )
          : Align(
              child: IconButton(
                tooltip: compactTooltip ?? label,
                onPressed: onTap,
                isSelected: selected,
                selectedIcon: Icon(icon, color: colors.primary),
                icon: Icon(icon),
              ),
            ),
    );
    final mailboxLabel = _mailbox['address'] as String? ?? l10n.mailMailbox;
    return FocusTraversalGroup(
      child: ListView(
        key: const ValueKey('mail-folder-sidebar'),
        primary: false,
        padding: EdgeInsets.fromLTRB(
          labelled ? 8 : 0,
          AppSpacing.sm,
          labelled ? 8 : 0,
          AppPageInsets.contentBottomClearance(context) + AppSpacing.sm,
        ),
        children: [
          if (_canSend)
            if (labelled)
              Padding(
                padding: const EdgeInsets.only(bottom: AppSpacing.sm),
                child: AppButton.primary(
                  leading: const Icon(Icons.edit_outlined, size: 18),
                  onPressed: _mutating ? null : _compose,
                  child: Text(l10n.mailCompose),
                ),
              )
            else
              destination(
                label: l10n.mailCompose,
                icon: Icons.edit_outlined,
                onTap: _mutating ? null : _compose,
              ),
          AppTooltip(
            message: mailboxLabel,
            excludeFromSemantics: true,
            child: destination(
              label: mailboxLabel,
              icon: Icons.alternate_email,
              onTap: _mailboxes.isEmpty || _mutating ? null : _chooseMailbox,
            ),
          ),
          for (final folder in folders.entries)
            destination(
              label: folder.value,
              compactTooltip: '${l10n.mailFolders} · ${folder.value}',
              icon: _mailFolderIcon(folder.key),
              selected: _isMailFolderSelected(folder.key),
              onTap: _mutating ? null : () => _selectFolder(folder.key),
            ),
          if (_folders.isNotEmpty || _labels.isNotEmpty)
            destination(
              label: l10n.mailLabels,
              icon: Icons.filter_alt_outlined,
              selected: _labelId != null || _folderId != null,
              onTap: _mutating ? null : _chooseFilter,
            ),
        ],
      ),
    );
  }
}
