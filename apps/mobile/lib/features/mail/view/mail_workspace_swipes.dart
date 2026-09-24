part of 'mail_page.dart';

extension _MailWorkspaceSwipes on _MailWorkspaceState {
  Future<void> _swipeMessage(
    Map<String, dynamic> item,
    MailSwipeAction swipe,
  ) async {
    final box = _mailboxId;
    if (_mutating ||
        !_accessVerified ||
        box == null ||
        swipe == MailSwipeAction.none) {
      return;
    }
    final id = item['id'] as String;
    if (_pendingSwipeIds.contains(id)) return;
    final unread =
        item['unread'] == true || (item['unreadCount'] as int? ?? 0) > 0;
    final starred = item['starred'] == true;
    var action = switch (swipe) {
      MailSwipeAction.archive => _folder == 'archive' ? 'restore' : 'archive',
      MailSwipeAction.trash => 'trash',
      MailSwipeAction.read => unread ? 'mark_read' : 'mark_unread',
      MailSwipeAction.star => starred ? 'unstar' : 'star',
      MailSwipeAction.move => 'move_to_folder',
      MailSwipeAction.snooze => _folder == 'snoozed' ? 'unsnooze' : 'snooze',
      MailSwipeAction.mute => _folder == 'muted' ? 'unmute' : 'mute',
      MailSwipeAction.none => '',
    };
    DateTime? snoozedUntil;
    if (action == 'snooze') {
      snoozedUntil = await chooseMailSnoozeTime(context);
      if (!mounted || snoozedUntil == null || box != _mailboxId) return;
    }
    String? folderId;
    if (swipe == MailSwipeAction.move) {
      folderId = await _chooseMailOption(context.l10n.mailSwipeMove, {
        '__inbox': context.l10n.mailInbox,
        '__archive': context.l10n.mailArchive,
        '__trash': context.l10n.mailTrash,
        for (final folder in _folders)
          folder['id'] as String: folder['name'] as String,
      }, null);
      if (!mounted || box != _mailboxId || folderId == null) return;
      if (folderId.startsWith('__')) {
        action = switch (folderId) {
          '__inbox' => 'restore',
          '__archive' => 'archive',
          _ => 'trash',
        };
        folderId = null;
      }
    }
    final before = _items;
    final generation = ++_generation;
    final threads = _threads;
    _pendingSwipeIds.add(id);
    _updateState(() {
      _loading = false;
      _items = optimisticMailItems(
        _items,
        {id},
        action: action,
        folder: _folder,
        query: _search.text,
      );
    });
    _saveView();
    try {
      await _repository.bulk(
        widget.workspaceId,
        box,
        [id],
        action,
        threads: threads,
        folderId: folderId,
        snoozedUntil: snoozedUntil,
      );
      if (!mounted || generation != _generation || box != _mailboxId) return;
      _saveView();
      final inverse = switch (action) {
        'snooze' => 'unsnooze',
        'mute' => 'unmute',
        'mark_read' => 'mark_unread',
        'mark_unread' => 'mark_read',
        'star' => 'unstar',
        'unstar' => 'star',
        'archive' || 'trash' when _folder == 'inbox' => 'restore',
        _ => null,
      };
      if (_childRouteOpen) return;
      _dismissSwipeFeedback();
      final width = MediaQuery.sizeOf(context).width;
      final sideInset = width > 320 ? (width - 288) / 2 : 16.0;
      final messenger = ScaffoldMessenger.of(context)
        ..clearSnackBars()
        ..removeCurrentSnackBar();
      final feedback = messenger.showSnackBar(
        SnackBar(
          duration: const Duration(seconds: 3),
          persist: false,
          margin: EdgeInsets.fromLTRB(
            sideInset,
            0,
            sideInset,
            lookupShellTitleOverrideCubit(context) != null &&
                    MediaQuery.sizeOf(context).width < 600
                ? 96
                : 16,
          ),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 2),
          content: Text(swipe.label(context)),
          action: inverse == null
              ? null
              : SnackBarAction(
                  label: context.l10n.mailSwipeUndo,
                  onPressed: () async {
                    if (!mounted ||
                        _mailboxId != box ||
                        _mutating ||
                        _pendingSwipeIds.contains(id)) {
                      return;
                    }
                    _updateState(() => _mutating = true);
                    try {
                      await _repository.bulk(
                        widget.workspaceId,
                        box,
                        [id],
                        inverse,
                        threads: threads,
                      );
                      if (inverse == 'restore' && unread) {
                        await _repository.bulk(
                          widget.workspaceId,
                          box,
                          [id],
                          'mark_unread',
                          threads: threads,
                        );
                      }
                      if (mounted && _mailboxId == box) await _load();
                    } on Object {
                      if (mounted) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(
                            content: Text(context.l10n.mailActionFailed),
                          ),
                        );
                      }
                    } finally {
                      if (mounted) {
                        _updateState(() => _mutating = false);
                      }
                    }
                  },
                ),
        ),
      );
      _swipeFeedback = feedback;
      unawaited(
        feedback.closed.then((_) {
          if (identical(_swipeFeedback, feedback)) _swipeFeedback = null;
        }),
      );
    } on Object {
      if (!mounted || generation != _generation) return;
      _updateState(() => _items = before);
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(context.l10n.mailActionFailed)));
    } finally {
      _pendingSwipeIds.remove(id);
      if (mounted && box == _mailboxId && _pendingSwipeIds.isEmpty) {
        unawaited(_load());
      }
    }
  }
}
