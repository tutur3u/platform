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

/// A More entry as the shell sheet, a pane menu and the bar render it.
typedef _MailMoreEntry = ({
  String id,
  IconData icon,
  String label,
  bool enabled,
  bool destructive,
  Future<void> Function() run,
});

extension _MailReaderChrome on _MailReaderState {
  bool get _unread =>
      _unreadOverride ?? _messages.any((message) => message['unread'] == true);

  bool get _muted =>
      _mutedOverride ?? (_messageStateMetadata?['muted'] == true);

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

  /// As the default action, Mark unread returns to the list like Archive.
  Future<void> _quickToggleRead() =>
      _action(_unread ? 'mark_read' : 'mark_unread', close: !_unread);

  Future<void> _archiveOrRestore() =>
      _action(_canRestore ? 'restore' : 'archive', close: true);

  /// Delete closes the reader at once; the inbox offers Undo.
  Future<void> _trashMessage() => _action('trash', close: true);

  Future<void> _toggleSnooze() =>
      _action(_messageSnoozed ? 'unsnooze' : 'snooze');

  Future<void> _toggleMute() => _action(_muted ? 'unmute' : 'mute');

  Future<void> _toggleImagesAsync() async => _toggleReaderImages();

  Future<void> _chooseAppearanceAsync() => _chooseAppearance();

  void _setAppearance(String id) {
    final mode = MailMessageAppearance.values
        .where((value) => value.name == id)
        .firstOrNull;
    if (mode != null) unawaited(MailAppearancePreference.instance.select(mode));
  }

  /// Shares the newest message as plain text through the system sheet.
  Future<void> _shareMessage() async {
    final message = _messages.lastOrNull;
    if (message == null) return;
    final subject = _subjectText;
    final box = context.findRenderObject() as RenderBox?;
    await SharePlus.instance.share(
      ShareParams(
        subject: subject,
        text: mailShareText(
          subject: subject,
          message: message,
          profile: _person(message['fromAddress'] as String?),
          hiddenFallback: context.l10n.mailMember,
        ),
        sharePositionOrigin: box == null
            ? null
            : box.localToGlobal(Offset.zero) & box.size,
      ),
    );
  }

  String get _subjectText {
    final subject = widget.thread
        ? ((_detail?['thread'] as Map<String, dynamic>?)?['subject'] as String?)
        : (_detail?['subject'] as String?);
    return subject?.trim().isNotEmpty == true
        ? subject!.trim()
        : context.l10n.mailNoSubject;
  }

  /// The navbar shows where the message lives until its subject heading
  /// scrolls away, then the subject.
  String _navbarTitle(String subject) {
    if (_subjectInTitle && subject.isNotEmpty) return subject;
    final l10n = context.l10n;
    return switch (widget.sourceFolder) {
      'archive' => l10n.mailArchive,
      'trash' => l10n.mailTrash,
      'snoozed' => l10n.mailSnoozed,
      'muted' => l10n.mailMuted,
      'sent' => l10n.mailSent,
      'starred' => l10n.mailStarred,
      'spam' => l10n.mailSpam,
      _ => l10n.mailInbox,
    };
  }

  Widget _readerChrome(String subject) => Stack(
    children: [
      ShellTitleOverride(
        ownerId: 'mail-reader',
        locations: const {Routes.mail},
        title: _navbarTitle(subject),
        showLeadingBrand: false,
      ),
      ShellChromeActions(
        ownerId: 'mail-reader',
        locations: const {Routes.mail},
        actions: _navbarActions(),
        actionGroup: _dockGroup(),
        // The reader sits in Mail's own navigator at the Mail location, so
        // the dock's Back closes it back to the list instead of leaving Mail.
        // While the reader animates out, Back does nothing; the registration
        // retires with the reader. A reader opened from Notifications leaves
        // Back to the shell, which returns there in one step.
        onBack:
            widget.notificationEntry &&
                (ShellRouteTransitionScope.maybeOf(
                      context,
                    )?.hasNotificationsOrigin() ??
                    false)
            ? null
            : _closeFromBack,
      ),
    ],
  );

  MailReaderDockPlan _dockPlan() => MailReaderDockPlan.build(
    canSend: widget.canSend,
    primary: MailPrimaryActionPreference.instance.value,
    quarantined: _quarantined,
    inTrash: widget.sourceFolder == 'trash',
    canRestore: _canRestore,
    unread: _unread,
    snoozed: _messageSnoozed,
    thread: widget.thread,
    muted: _muted,
  );

  ({IconData icon, String label, Future<void> Function() run})? _quick() {
    final l10n = context.l10n;
    return switch (_dockPlan().quick) {
      null => null,
      MailQuickAction.archive => (
        icon: Icons.archive_outlined,
        label: l10n.mailArchive,
        run: _archiveOrRestore,
      ),
      MailQuickAction.restore => (
        icon: Icons.inbox_outlined,
        label: l10n.mailRestore,
        run: _archiveOrRestore,
      ),
      MailQuickAction.trash => (
        icon: Icons.delete_outline,
        label: l10n.commonDelete,
        run: _trashMessage,
      ),
      MailQuickAction.markRead => (
        icon: Icons.mark_email_read_outlined,
        label: l10n.mailMarkRead,
        run: _quickToggleRead,
      ),
      MailQuickAction.markUnread => (
        icon: Icons.mark_email_unread_outlined,
        label: l10n.mailMarkUnread,
        run: _quickToggleRead,
      ),
    };
  }

  /// The default action, one tap away beside the title.
  List<ShellActionSpec> _navbarActions() {
    final quick = _quick();
    final ready = !_busy && _detail != null && !_readPending;
    return [
      if (quick != null)
        ShellActionSpec(
          id: 'mail-reader-quick',
          icon: quick.icon,
          tooltip: quick.label,
          enabled: ready,
          callbackToken: (quick.label, ready),
          onPressed: quick.run,
        ),
    ];
  }

  _MailMoreEntry _moreEntry(MailDockMore kind) {
    final l10n = context.l10n;
    final ready = !_busy && _detail != null;
    _MailMoreEntry entry(
      String id,
      IconData icon,
      String label,
      Future<void> Function() run, {
      bool enabled = true,
      bool destructive = false,
    }) => (
      id: id,
      icon: icon,
      label: label,
      enabled: enabled,
      destructive: destructive,
      run: run,
    );
    return switch (kind) {
      MailDockMore.markRead || MailDockMore.markUnread => entry(
        'mark-read',
        _mailMessageActionIcon(_unread ? 'mark_read' : 'mark_unread'),
        _unread ? l10n.mailMarkRead : l10n.mailMarkUnread,
        _toggleRead,
        enabled: ready && !_readPending,
      ),
      MailDockMore.snooze || MailDockMore.unsnooze => entry(
        'snooze',
        _mailMessageActionIcon(_messageSnoozed ? 'unsnooze' : 'snooze'),
        _messageSnoozed ? l10n.mailUnsnooze : l10n.mailSnooze,
        _toggleSnooze,
        enabled: ready,
      ),
      MailDockMore.mute || MailDockMore.unmute => entry(
        'mute',
        _mailMessageActionIcon(_muted ? 'unmute' : 'mute'),
        _muted ? l10n.mailUnmute : l10n.mailMute,
        _toggleMute,
        enabled: ready,
      ),
      MailDockMore.labels => entry(
        'labels',
        Icons.label_outline,
        l10n.mailLabels,
        _readerLabels,
        enabled: ready,
      ),
      MailDockMore.archive || MailDockMore.restore => entry(
        'archive',
        _canRestore ? Icons.inbox_outlined : Icons.archive_outlined,
        _canRestore ? l10n.mailRestore : l10n.mailArchive,
        _archiveOrRestore,
        enabled: ready,
      ),
      MailDockMore.move => entry(
        'move',
        Icons.drive_file_move_outlined,
        l10n.mailMove,
        _moveMessage,
        enabled: ready,
      ),
      MailDockMore.appearance => entry(
        'appearance',
        Icons.contrast_rounded,
        l10n.mailMessageAppearance,
        _chooseAppearanceAsync,
      ),
      MailDockMore.images => entry(
        'images',
        _showImages ? Icons.image_outlined : Icons.image_not_supported_outlined,
        _showImages ? l10n.mailHideImages : l10n.mailLoadImages,
        _toggleImagesAsync,
      ),
      MailDockMore.share => entry(
        'share',
        Icons.ios_share_outlined,
        l10n.commonShare,
        _shareMessage,
        enabled: _detail != null,
      ),
      MailDockMore.trash => entry(
        'trash',
        _mailMessageActionIcon('trash'),
        l10n.commonDelete,
        _trashMessage,
        enabled: ready,
        destructive: true,
      ),
    };
  }

  /// Replies (or a read-only mailbox's common commands) fill the bar beside
  /// Back; More holds everything else, with Delete last.
  ShellDockActionGroup _dockGroup() {
    final l10n = context.l10n;
    final plan = _dockPlan();
    final canReply = !_busy && _detail != null && _messages.isNotEmpty;
    final appearance = mailEffectiveAppearance(context);

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

    ShellDockGroupAction action(MailDockMore kind) {
      final entry = _moreEntry(kind);
      return ShellDockGroupAction(
        id: entry.id,
        icon: entry.icon,
        label: entry.label,
        enabled: entry.enabled,
        destructive: entry.destructive,
        onPressed: entry.run,
      );
    }

    ShellDockMoreItem more(MailDockMore kind) => kind == MailDockMore.appearance
        ? ShellDockChoice(
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
              (
                id: MailMessageAppearance.dark.name,
                label: l10n.settingsThemeDark,
              ),
            ],
            selectedId: appearance.name,
            onSelected: _setAppearance,
          )
        : action(kind);

    return ShellDockActionGroup(
      actions: [
        for (final kind in plan.replies) reply(kind),
        for (final kind in plan.bar) action(kind),
      ],
      more: [
        for (final section in plan.more)
          [for (final kind in section) more(kind)],
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

  /// The More sheet for split panes and standalone readers, which have no
  /// shell dock: replies first, then the same entries as the dock's More.
  Future<void> _chooseAction() async {
    if (_busy || _detail == null) return;
    final l10n = context.l10n;
    final plan = _dockPlan();
    final entries = <_MailMoreEntry>[
      if (plan.replies.contains(MailDockReply.replyAll))
        (
          id: 'reply_all',
          icon: Icons.reply_all_outlined,
          label: l10n.mailReplyAll,
          enabled: true,
          destructive: false,
          run: _replyAllLast,
        ),
      if (plan.replies.contains(MailDockReply.forward))
        (
          id: 'forward',
          icon: Icons.forward_outlined,
          label: l10n.mailForward,
          enabled: true,
          destructive: false,
          run: _forwardLast,
        ),
      for (final kind in [...plan.bar, ...plan.more.expand((s) => s)])
        _moreEntry(kind),
    ];
    final value = await showAppActionSheet<String>(
      context: context,
      useRootNavigator: true,
      title: _subjectText,
      actions: [
        for (final entry in entries)
          AppSheetAction(
            label: entry.label,
            icon: entry.icon,
            value: entry.id,
            destructive: entry.destructive,
            enabled: entry.enabled,
          ),
      ],
    );
    if (!mounted || value == null) return;
    await entries.firstWhere((entry) => entry.id == value).run();
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
