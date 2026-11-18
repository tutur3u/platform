part of 'mail_reader.dart';

IconData _mailMessageActionIcon(String action) => switch (action) {
  'snooze' => Icons.snooze_outlined,
  'unsnooze' => Icons.alarm_off_outlined,
  'mute' => Icons.volume_off_outlined,
  'unmute' => Icons.volume_up_outlined,
  'archive' => Icons.archive_outlined,
  'mark_read' => Icons.mark_email_read_outlined,
  'mark_unread' => Icons.mark_email_unread_outlined,
  'restore' => Icons.inbox_outlined,
  'trash' => Icons.delete_outline,
  'star' => Icons.star_border,
  'unstar' => Icons.star,
  _ => Icons.more_horiz,
};

extension _MailReaderChrome on _MailReaderState {
  bool get _unread =>
      _unreadOverride ?? _messages.any((message) => message['unread'] == true);

  // Dock entries use method tear-offs, which compare equal across rebuilds, so
  // the registered group only changes when its contents do.
  Future<void> _replyLast() async {
    if (_messages.isNotEmpty) await _reply(_messages.last);
  }

  Future<void> _replyAllLast() async {
    if (_messages.isNotEmpty) await _reply(_messages.last, all: true);
  }

  Future<void> _forwardLast() async {
    if (_messages.isNotEmpty) await _reply(_messages.last, forward: true);
  }

  Future<void> _toggleStar() => _action(_starred ? 'unstar' : 'star');

  Future<void> _toggleRead() => _action(_unread ? 'mark_read' : 'mark_unread');

  Future<void> _archiveOrRestore() =>
      _action(_canRestore ? 'restore' : 'archive', close: true);

  Future<void> _trashMessage() => _action('trash', close: true);

  void _setAppearance(String id) {
    final mode = MailMessageAppearance.values
        .where((value) => value.name == id)
        .firstOrNull;
    if (mode != null) unawaited(MailAppearancePreference.instance.select(mode));
  }

  Widget _readerChrome(String subject) => Stack(
    children: [
      ShellTitleOverride(
        ownerId: 'mail-reader',
        locations: const {Routes.mail},
        title: subject,
        showLeadingBrand: false,
      ),
      ShellChromeActions(
        ownerId: 'mail-reader',
        locations: const {Routes.mail},
        actionGroup: _dockGroup(),
        // The reader sits in Mail's own navigator at the Mail location, so
        // the dock's Back closes it back to the list instead of leaving Mail.
        // While the reader animates out, Back does nothing; the registration
        // retires with the reader.
        onBack: _closeFromBack,
      ),
    ],
  );

  /// Reply, Reply all and Forward fill the pill, the primary command owns the
  /// circle, and everything else lives in the More sheet.
  ShellDockActionGroup _dockGroup() {
    final l10n = context.l10n;
    final primary = _primaryAction;
    final ready = !_busy && _detail != null;
    final plan = MailReaderDockPlan.build(
      canSend: widget.canSend,
      primary: primary,
      quarantined: _quarantined,
      inTrash: widget.sourceFolder == 'trash',
      canRestore: _canRestore,
      starred: _starred,
      unread: _unread,
    );
    final canReply = ready && _messages.isNotEmpty;
    final readBlocked = _readPending;
    final appearance =
        MailAppearancePreference.instance.value ??
        MailMessageAppearance.original;

    ShellDockGroupAction reply(MailDockReply kind) => switch (kind) {
      MailDockReply.reply => ShellDockGroupAction(
        id: 'reply',
        icon: Icons.reply_outlined,
        label: l10n.mailReply,
        enabled: canReply,
        onPressed: _replyLast,
      ),
      MailDockReply.replyAll => ShellDockGroupAction(
        id: 'reply-all',
        icon: Icons.reply_all_outlined,
        label: l10n.mailReplyAll,
        enabled: canReply,
        onPressed: _replyAllLast,
      ),
      MailDockReply.forward => ShellDockGroupAction(
        id: 'forward',
        icon: Icons.forward_outlined,
        label: l10n.mailForward,
        enabled: canReply,
        onPressed: _forwardLast,
      ),
    };

    ShellDockMoreItem more(MailDockMore kind) => switch (kind) {
      MailDockMore.inbox => ShellDockGroupAction(
        id: 'inbox',
        icon: Icons.inbox_outlined,
        label: l10n.mailInbox,
        onPressed: _close,
      ),
      MailDockMore.appearance => ShellDockChoice(
        id: 'appearance',
        icon: Icons.contrast_rounded,
        label: l10n.mailMessageAppearance,
        options: [
          (
            id: MailMessageAppearance.original.name,
            label: l10n.mailAppearanceOriginal,
          ),
          (
            id: MailMessageAppearance.light.name,
            label: l10n.settingsThemeLight,
          ),
          (id: MailMessageAppearance.dark.name, label: l10n.settingsThemeDark),
        ],
        selectedId: appearance.name,
        onSelected: _setAppearance,
      ),
      MailDockMore.images => ShellDockGroupAction(
        id: 'images',
        icon: _showImages
            ? Icons.image_outlined
            : Icons.image_not_supported_outlined,
        label: _showImages ? l10n.mailHideImages : l10n.mailLoadImages,
        onPressed: _toggleReaderImages,
      ),
      MailDockMore.star || MailDockMore.unstar => ShellDockGroupAction(
        id: 'star',
        icon: _mailMessageActionIcon(_starred ? 'unstar' : 'star'),
        label: _starred ? l10n.mailUnstar : l10n.mailStar,
        enabled: ready,
        onPressed: _toggleStar,
      ),
      MailDockMore.markRead || MailDockMore.markUnread => ShellDockGroupAction(
        id: 'mark-read',
        icon: _mailMessageActionIcon(_unread ? 'mark_read' : 'mark_unread'),
        label: _unread ? l10n.mailMarkRead : l10n.mailMarkUnread,
        enabled: ready && !readBlocked,
        onPressed: _toggleRead,
      ),
      MailDockMore.archive || MailDockMore.restore => ShellDockGroupAction(
        id: 'archive',
        icon: _canRestore ? Icons.inbox_outlined : Icons.archive_outlined,
        label: _canRestore ? l10n.mailRestore : l10n.mailArchive,
        enabled: ready,
        onPressed: _archiveOrRestore,
      ),
      MailDockMore.move => ShellDockGroupAction(
        id: 'move',
        icon: Icons.drive_file_move_outlined,
        label: l10n.mailMove,
        enabled: ready,
        onPressed: _moveMessage,
      ),
      MailDockMore.trash => ShellDockGroupAction(
        id: 'trash',
        icon: _mailMessageActionIcon('trash'),
        label: l10n.mailTrash,
        enabled: ready,
        destructive: true,
        onPressed: _trashMessage,
      ),
    };

    const reader = {
      MailDockMore.inbox,
      MailDockMore.appearance,
      MailDockMore.images,
    };
    final circleRestores = primary == MailPrimaryAction.archive && _canRestore;
    return ShellDockActionGroup(
      actions: [for (final kind in plan.replies) reply(kind)],
      primary: ShellDockGroupAction(
        id: switch (primary) {
          MailPrimaryAction.archive => 'archive',
          MailPrimaryAction.trash => 'trash',
          MailPrimaryAction.markUnread => 'mark-unread-primary',
          MailPrimaryAction.reply => 'reply',
        },
        icon: circleRestores ? Icons.inbox_outlined : primary.icon,
        label: circleRestores ? l10n.mailRestore : primary.label(context),
        enabled:
            ready && !(_readPending && primary == MailPrimaryAction.markUnread),
        onPressed: _runPrimaryAction,
      ),
      more: [
        [
          for (final kind in plan.more)
            if (reader.contains(kind)) more(kind),
        ],
        [
          for (final kind in plan.more)
            if (!reader.contains(kind)) more(kind),
        ],
      ],
    );
  }

  Future<void> _chooseAppearance() async {
    final l10n = context.l10n;
    final modes = {
      MailMessageAppearance.original: l10n.mailAppearanceOriginal,
      MailMessageAppearance.light: l10n.settingsThemeLight,
      MailMessageAppearance.dark: l10n.settingsThemeDark,
    };
    final value = await showAdaptiveSheet<MailMessageAppearance>(
      context: context,
      useRootNavigator: true,
      builder: (sheetContext) => AppDialogScaffold(
        title: l10n.mailMessageAppearance,
        child: Material(
          color: Colors.transparent,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              for (final mode in modes.entries)
                ListTile(
                  dense: true,
                  leading: Icon(switch (mode.key) {
                    MailMessageAppearance.original =>
                      Icons.auto_awesome_outlined,
                    MailMessageAppearance.light => Icons.light_mode_outlined,
                    MailMessageAppearance.dark => Icons.dark_mode_outlined,
                  }),
                  title: Text(mode.value),
                  selected: MailAppearancePreference.instance.value == mode.key,
                  onTap: () => Navigator.of(sheetContext).pop(mode.key),
                ),
            ],
          ),
        ),
      ),
    );
    if (value != null) await MailAppearancePreference.instance.select(value);
  }

  Future<void> _chooseAction(Map<String, String> actions) async {
    if (_busy || _detail == null) return;
    final subject = widget.thread
        ? ((_detail?['thread'] as Map<String, dynamic>?)?['subject'] as String?)
        : (_detail?['subject'] as String?);
    final value = await showAppActionSheet<String>(
      context: context,
      useRootNavigator: true,
      title: subject?.trim().isNotEmpty == true
          ? subject!
          : context.l10n.mailNoSubject,
      actions: [
        if (widget.canSend) ...[
          if (_primaryAction != MailPrimaryAction.reply)
            AppSheetAction(
              label: context.l10n.mailReply,
              icon: Icons.reply_outlined,
              value: 'reply',
            ),
          AppSheetAction(
            label: context.l10n.mailReplyAll,
            icon: Icons.reply_all_outlined,
            value: 'reply_all',
          ),
          AppSheetAction(
            label: context.l10n.mailForward,
            icon: Icons.forward_outlined,
            value: 'forward',
          ),
        ],
        AppSheetAction(
          label: _starred ? context.l10n.mailUnstar : context.l10n.mailStar,
          icon: _mailMessageActionIcon(_starred ? 'unstar' : 'star'),
          value: _starred ? 'unstar' : 'star',
        ),
        if (!_quarantined)
          AppSheetAction(
            label: context.l10n.mailMove,
            icon: Icons.drive_file_move_outlined,
            value: 'move',
          ),
        for (final action in actions.entries)
          AppSheetAction(
            label: action.value,
            icon: _mailMessageActionIcon(action.key),
            value: action.key,
            destructive: action.key == 'trash',
            enabled:
                !_readPending ||
                (action.key != 'mark_read' && action.key != 'mark_unread'),
          ),
      ],
    );
    if (!mounted || value == null) return;
    switch (value) {
      case 'move':
        await _moveMessage();
        return;
      case 'reply':
        await _replyLast();
        return;
      case 'reply_all':
        await _replyAllLast();
        return;
      case 'forward':
        await _forwardLast();
        return;
    }
    await _action(value, close: value != 'star' && value != 'unstar');
  }

  /// Lists the destinations for the open message and applies the chosen one.
  Future<void> _moveMessage() async {
    if (_busy || _detail == null || _quarantined) return;
    final l10n = context.l10n;
    final destinations = mailMoveDestinations(
      sourceFolder: widget.sourceFolder,
      folders: widget.folders,
    );
    if (destinations.isEmpty) return;
    final destination = await showAppActionSheet<MailMoveDestination>(
      context: context,
      useRootNavigator: true,
      title: l10n.mailSwipeMove,
      actions: [
        for (final item in destinations)
          AppSheetAction(
            label: switch (item.action) {
              'restore' => l10n.mailInbox,
              'archive' => l10n.mailArchive,
              'trash' => l10n.mailTrash,
              _ => item.name!,
            },
            icon: switch (item.action) {
              'restore' => Icons.inbox_outlined,
              'archive' => Icons.archive_outlined,
              'trash' => Icons.delete_outline,
              _ => Icons.folder_outlined,
            },
            value: item,
            destructive: item.action == 'trash',
          ),
      ],
    );
    if (!mounted || destination == null) return;
    await _action(
      destination.action,
      close: true,
      folderId: destination.folderId,
    );
  }
}
