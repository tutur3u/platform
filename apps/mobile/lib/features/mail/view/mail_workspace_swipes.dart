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
    if (_pendingSwipeIds.containsKey(id) ||
        _pendingDeferredIds.containsKey(id)) {
      return;
    }
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
    final sourceFolder = _folder;
    final sourceListKey = _visibleListKey;
    final deferredIndex = _items.indexWhere((row) => row['id'] == id);
    final generation = ++_generation;
    final threads = _threads;
    if ((action == 'archive' || action == 'trash') && sourceFolder == 'inbox') {
      _pendingDeferredIds[id] = (mailbox: box, action: action);
      // A pane still showing this conversation closes with its row: a change
      // made there would reach the server ahead of the held write.
      if (_activeSelection?.id == id) _closeSelection();
      _updateState(() {
        _loading = false;
        _items = optimisticMailItems(
          _items,
          {id},
          action: action,
          folder: _folder,
          query: _query,
        );
      });
      _saveView();
      _presentOrQueueFeedback(
        _PendingMailFeedback(
          message: action == 'archive'
              ? context.l10n.mailFeedbackArchived
              : context.l10n.mailFeedbackTrashed,
          box: box,
          folder: sourceFolder,
          listKey: sourceListKey,
          id: id,
          threads: threads,
          inverse: 'restore',
          deferredItem: item,
          deferredIndex: deferredIndex >= 0 ? deferredIndex : 0,
          heldActivity: item['lastMessageAt'],
          commit: () => _repository.bulk(
            widget.workspaceId,
            box,
            [id],
            action,
            threads: threads,
          ),
        ),
      );
      return;
    }
    _pendingSwipeIds[id] = box;
    _updateState(() {
      _loading = false;
      _items = optimisticMailItems(
        _items,
        {id},
        action: action,
        folder: _folder,
        query: _query,
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
        'archive' || 'trash' when sourceFolder == 'inbox' => 'restore',
        _ => null,
      };
      _presentOrQueueFeedback(
        _PendingMailFeedback(
          message: switch (action) {
            'archive' => context.l10n.mailFeedbackArchived,
            'trash' => context.l10n.mailFeedbackTrashed,
            _ => swipe.label(context),
          },
          box: box,
          folder: sourceFolder,
          listKey: sourceListKey,
          id: id,
          threads: threads,
          inverse: inverse,
          restoreUnread: unread,
        ),
      );
    } on Object {
      if (!mounted || generation != _generation) return;
      _updateState(() => _items = before);
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(context.l10n.mailActionFailed)));
    } finally {
      _pendingSwipeIds.remove(id);
      if (mounted &&
          box == _mailboxId &&
          !_pendingSwipeIds.containsValue(box)) {
        unawaited(_load());
      }
    }
  }

  bool _isFeedbackVisible(_PendingMailFeedback feedback) =>
      mounted &&
      !_childRouteOpen &&
      _mailboxId == feedback.box &&
      _folder == feedback.folder;

  void _presentOrQueueFeedback(_PendingMailFeedback feedback) {
    _flushPendingOnly();
    _flushActiveOnly();
    if (_isFeedbackVisible(feedback)) {
      _showMailFeedback(feedback);
    } else if (mounted &&
        _mailboxId == feedback.box &&
        _folder == feedback.folder) {
      _pendingFeedback = feedback;
    } else {
      _flushDeferredCommit(feedback);
    }
  }

  void _flushPendingFeedback() {
    final pending = _pendingFeedback;
    if (pending == null) return;
    _pendingFeedback = null;
    _presentOrQueueFeedback(pending);
  }

  void _flushPendingOnly() {
    final pending = _pendingFeedback;
    if (pending == null) return;
    _pendingFeedback = null;
    _flushDeferredCommit(pending);
  }

  void _flushActiveOnly() {
    final active = _activeFeedback;
    if (active == null) return;
    _activeFeedback = null;
    _flushDeferredCommit(active);
  }

  void _flushAllDeferredFeedback() {
    _flushPendingOnly();
    _flushActiveOnly();
  }

  /// Starts every deferred write and completes once the server has them, so
  /// a selection or folder-wide change cannot reach the server ahead of the
  /// Archive or Delete it follows. The Undo control goes with them.
  Future<void> _settleDeferredWrites() async {
    _flushAllDeferredFeedback();
    _dismissSwipeFeedback();
    while (_inFlightDeferredCommits.isNotEmpty) {
      await Future.wait(_inFlightDeferredCommits.toList());
    }
  }

  /// Whether a write the user asked for in this view may still be sent: the
  /// view is live, its mailbox access stands, and the signed-in account is
  /// the one that asked. The repository attributes a write to the account
  /// that is current when it is submitted.
  bool get _canSubmitWrites => !_accessDenied && _currentUserId() == _accountId;

  void _flushDeferredCommit(_PendingMailFeedback feedback) {
    if (feedback.settled) return;
    feedback.settled = true;
    final commit = feedback.commit;
    // Feedback for a finished write holds nothing; a later held write for
    // the same conversation keeps its own entry.
    if (commit == null) return;
    if (!_canSubmitWrites) {
      _pendingDeferredIds.remove(feedback.id);
      return;
    }
    late final Future<void> flight;
    flight = _runDeferredCommit(feedback, commit).whenComplete(() {
      _inFlightDeferredCommits.remove(flight);
    });
    _inFlightDeferredCommits.add(flight);
  }

  Future<void> _runDeferredCommit(
    _PendingMailFeedback feedback,
    Future<void> Function() commit,
  ) async {
    var failed = false;
    try {
      await commit();
    } on Object {
      failed = true;
    } finally {
      _pendingDeferredIds.remove(feedback.id);
      if (mounted && !_disposing) {
        if (failed) {
          // The conversation never left the folder. Its row returns here,
          // because the reload below may fail or have to wait.
          _returnDeferredRow(feedback);
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(context.l10n.mailActionFailed)),
          );
        }
        // A selection or folder-wide change waiting on this write reloads,
        // and a reload would drop a selection the user is still building.
        if (!_mutating &&
            _selected.isEmpty &&
            feedback.box == _mailboxId &&
            _visibleMailboxSettled) {
          unawaited(_load());
        }
      }
    }
  }

  /// Whether no write for the visible mailbox is still on its way. A write
  /// for another mailbox never holds back this one's reload.
  bool get _visibleMailboxSettled {
    final box = _mailboxId;
    return !_pendingSwipeIds.containsValue(box) &&
        !_pendingReaderIds.values.any((write) => write.mailbox == box) &&
        !_pendingDeferredIds.values.any((write) => write.mailbox == box);
  }

  /// Cancels a held write when [rows], fresh from the server, list its
  /// conversation with a newer message than the row the user acted on. The
  /// server applies an Archive or Delete to every message it has when the
  /// write arrives, so that message would be filed away unseen. The row
  /// returns to the list it left. True when a write was cancelled.
  bool _keepConversationsWithNewMail(List<Map<String, dynamic>> rows) {
    var kept = false;
    for (final feedback in [_pendingFeedback, _activeFeedback]) {
      if (feedback == null ||
          feedback.commit == null ||
          feedback.settled ||
          feedback.box != _mailboxId) {
        continue;
      }
      final row = rows.where((row) => row['id'] == feedback.id).firstOrNull;
      final held = DateTime.tryParse('${feedback.heldActivity}');
      final latest = DateTime.tryParse('${row?['lastMessageAt']}');
      if (held == null || latest == null || !latest.isAfter(held)) continue;
      kept = true;
      feedback.settled = true;
      _pendingDeferredIds.remove(feedback.id);
      if (identical(_pendingFeedback, feedback)) _pendingFeedback = null;
      if (identical(_activeFeedback, feedback)) {
        _activeFeedback = null;
        _dismissSwipeFeedback();
      }
      _returnDeferredRow(feedback);
      if (!_childRouteOpen) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(context.l10n.mailFeedbackKeptNewMessage)),
        );
      }
    }
    return kept;
  }

  /// Puts a held row back where it was, when the list it left is the one
  /// on screen, and saves that view.
  void _returnDeferredRow(_PendingMailFeedback feedback) {
    final row = feedback.deferredItem;
    if (row == null ||
        _mailboxId != feedback.box ||
        _folder != feedback.folder ||
        _visibleListKey != feedback.listKey ||
        _items.any((item) => item['id'] == feedback.id)) {
      return;
    }
    final items = [..._items];
    items.insert((feedback.deferredIndex ?? 0).clamp(0, items.length), row);
    _updateState(() => _items = items);
    _saveView();
  }

  /// Confirms a finished or deferred change with an Undo that either cancels
  /// the pending write or applies its inverse action.
  void _showMailFeedback(_PendingMailFeedback feedback) {
    if (!_isFeedbackVisible(feedback)) return;
    _dismissSwipeFeedback();
    _activeFeedback = feedback;
    final width = MediaQuery.sizeOf(context).width;
    final sideInset = width > 320 ? (width - 288) / 2 : 16.0;
    final messenger = ScaffoldMessenger.of(context)
      ..clearSnackBars()
      ..removeCurrentSnackBar();
    final snack = messenger.showSnackBar(
      SnackBar(
        duration: const Duration(seconds: 3),
        persist: false,
        // A margin needs the floating behaviour, whatever the theme says.
        behavior: SnackBarBehavior.floating,
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
        content: Text(feedback.message),
        action: feedback.inverse == null
            ? null
            : SnackBarAction(
                label: context.l10n.mailSwipeUndo,
                onPressed: () async {
                  if (feedback.commit != null) {
                    if (feedback.settled) return;
                    feedback.settled = true;
                    if (identical(_activeFeedback, feedback)) {
                      _activeFeedback = null;
                    }
                    _pendingDeferredIds.remove(feedback.id);
                    if (!mounted || _mailboxId != feedback.box) return;
                    _returnDeferredRow(feedback);
                    // The server decides what the list holds; the returned
                    // row stands in until it answers, and if it cannot.
                    await _load();
                    return;
                  }
                  if (!mounted ||
                      !_canSubmitWrites ||
                      _mailboxId != feedback.box ||
                      _mutating ||
                      _pendingSwipeIds.containsKey(feedback.id)) {
                    return;
                  }
                  _updateState(() => _mutating = true);
                  try {
                    await _repository.bulk(
                      widget.workspaceId,
                      feedback.box,
                      [feedback.id],
                      feedback.inverse!,
                      threads: feedback.threads,
                    );
                    if (feedback.inverse == 'restore' &&
                        feedback.restoreUnread) {
                      await _repository.bulk(
                        widget.workspaceId,
                        feedback.box,
                        [feedback.id],
                        'mark_unread',
                        threads: feedback.threads,
                      );
                    }
                  } on Object {
                    if (mounted) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(content: Text(context.l10n.mailActionFailed)),
                      );
                    }
                  } finally {
                    if (mounted) {
                      _updateState(() => _mutating = false);
                      // Also covers a deferred write that finished meanwhile.
                      if (_mailboxId == feedback.box) unawaited(_load());
                    }
                  }
                },
              ),
      ),
    );
    _swipeFeedback = snack;
    unawaited(
      snack.closed.then((reason) {
        if (identical(_swipeFeedback, snack)) _swipeFeedback = null;
        if (identical(_activeFeedback, feedback)) _activeFeedback = null;
        if (reason != SnackBarClosedReason.action) {
          _flushDeferredCommit(feedback);
        }
      }),
    );
  }
}
