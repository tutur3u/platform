part of 'mail_page.dart';

/// The open conversation. It outlives layout changes: a split layout shows it
/// in the detail pane, a compact one in a pushed reader route.
class _MailSelection {
  _MailSelection({
    required this.item,
    required this.mailboxId,
    required this.folder,
    required this.thread,
    required this.notificationEntry,
    required this.beforeRead,
    required this.listKey,
  });

  final Map<String, dynamic> item;
  final String mailboxId;
  final String folder;
  final bool thread;
  final bool notificationEntry;
  final List<Map<String, dynamic>> beforeRead;

  /// The list [beforeRead] was taken from (mailbox, folder, query, labels).
  final String? listKey;
  String get id => item['id'] as String;
}

extension _MailWorkspaceOpen on _MailWorkspaceState {
  MailPreviewStore _createPreviewStore() => MailPreviewStore(
    // Prefetches make one attempt; only an open retries a transient failure.
    fetch: (mailboxId, id, {required thread, required background}) => background
        ? _repository.detail(widget.workspaceId, mailboxId, id, thread: thread)
        : _readOpenDetailWithRetry(mailboxId, id, thread),
    peekStored: (mailboxId, id, {required thread}) => thread && _accessVerified
        ? _repository.cachedThread(widget.workspaceId, mailboxId, id)
        : Future.value(),
    onError: (error) {
      if (mounted &&
          !_accessDenied &&
          error is ApiException &&
          (error.statusCode == 401 || error.statusCode == 403)) {
        unawaited(_denyCachedAccess());
      }
    },
    onLoaded: (mailboxId, id, {required thread}) {
      if (_prerenderIds.contains(id) && mailboxId == _mailboxId) {
        _prerender(id);
      }
    },
  );

  /// Renders the newest message's HTML ahead of the reader, as soon as the
  /// detail is in memory, so the open shows the body in its first frame.
  /// Only the row under the finger and an open conversation's neighbours
  /// are rendered ahead; visible-row prefetching stops at the detail.
  void _prerender(String id) {
    final box = _mailboxId;
    if (!mounted || box == null || !_canPrefetch) return;
    final detail = _previews.peek(box, id, thread: _threads)?.detail;
    if (detail == null) {
      _prerenderIds.add(id);
      while (_prerenderIds.length > 6) {
        _prerenderIds.remove(_prerenderIds.first);
      }
      return;
    }
    _prerenderIds.remove(id);
    final message = _threads ? mailRows(detail['messages']).lastOrNull : detail;
    if (message == null) return;
    final html = mailMessageHtml(message);
    if (html.isEmpty) return;
    _renderedDocuments.warm(
      mailDocumentRequest(
        context,
        html: html,
        loadImages: MailImagePreference.instance.value,
      ),
    );
  }

  /// Opens [item] without waiting for the network: the reader renders the
  /// inbox row (or the cached body) in the next frame and hydrates itself.
  Future<void> _open(
    Map<String, dynamic> item, {
    bool notificationEntry = false,
  }) async {
    final box = _mailboxId;
    if (box == null || (!_split && _childRouteOpen)) return;
    final request = ++_openRequest;
    final folder = _folder;
    _dismissSwipeFeedback();
    if (_pendingDeferredIds.containsKey(item['id'])) {
      // A write held or on its way for this conversation lands first, so
      // nothing done in its reader can reach the server ahead of it. The
      // open is dropped when another conversation was opened during the
      // wait, or the row's mailbox or folder is no longer the one shown.
      await _settleDeferredWrites();
      if (!mounted ||
          request != _openRequest ||
          box != _mailboxId ||
          folder != _folder ||
          (!_split && _childRouteOpen)) {
        return;
      }
    }
    if (_folder == 'drafts') {
      await _openDraft(item, box);
      return;
    }
    final selection = _MailSelection(
      item: item,
      mailboxId: box,
      folder: _folder,
      thread: _threads,
      notificationEntry: notificationEntry,
      beforeRead: _items,
      listKey: _visibleListKey,
    );
    if (selection.thread) {
      unawaited(_archiveViewedMailThread(box, selection.id));
    }
    _updateState(() {
      _selection = selection;
      _items = optimisticMailItems(
        _items,
        {selection.id},
        action: 'mark_read',
        folder: _folder,
        query: _query,
      );
    });
    _prefetchAround(selection.id, selection.beforeRead);
    if (!_split) await _presentReaderRoute(selection);
  }

  /// Drafts change whenever the composer saves, so they always load fresh
  /// through the repository instead of the long-lived preview store.
  Future<void> _openDraft(Map<String, dynamic> item, String box) async {
    try {
      final draft = await _readOpenDetailWithRetry(
        box,
        item['id'] as String,
        false,
      );
      if (mounted && box == _mailboxId && _folder == 'drafts') {
        await _compose(draft);
      }
    } on Object {
      if (mounted) _showOpenFailure(item);
    }
  }

  Future<void> _presentReaderRoute(_MailSelection selection) async {
    final route = MaterialPageRoute<void>(
      builder: (_) => AppMasterDetailRouteBody(
        onSplit: () => _onSplitChanged(true),
        child: _buildReader(selection, pane: false),
      ),
    );
    _readerRoute = route;
    await _pushChild(route);
    if (_readerRoute == route) _readerRoute = null;
    if (!mounted || !identical(_selection, selection)) return;
    if (_migratingReader) {
      // The route was folded into the split layout's pane; keep reading.
      _migratingReader = false;
      return;
    }
    _closeSelection();
  }

  void _closeSelection() {
    final selection = _selection;
    if (selection == null) return;
    _updateState(() => _selection = null);
    if (mounted &&
        selection.mailboxId == _mailboxId &&
        selection.folder == _folder &&
        _visibleMailboxSettled) {
      unawaited(_load());
    }
  }

  /// Keeps one open selection when the body crosses the split width.
  void _onSplitChanged(bool split) {
    if (_split == split) return;
    _split = split;
    _syncSelectionWithLayout();
  }

  /// The selection, unless it belongs to a mailbox that is no longer shown.
  _MailSelection? get _activeSelection {
    final selection = _selection;
    return selection != null && selection.mailboxId == _mailboxId
        ? selection
        : null;
  }

  void _syncSelectionWithLayout() {
    if (!mounted || _selection == null) return;
    final selection = _activeSelection;
    final route = _readerRoute;
    if (selection == null) {
      // Never resurrect another mailbox's conversation on a resize.
      if (route == null) _updateState(() => _selection = null);
      return;
    }
    if (_split && route != null && route.isCurrent) {
      _migratingReader = true;
      Navigator.of(context).removeRoute(route);
    } else if (!_split && route == null && !_childRouteOpen) {
      unawaited(_presentReaderRoute(selection));
    }
  }

  Widget _buildReader(_MailSelection selection, {required bool pane}) {
    final box = selection.mailboxId;
    final cached = _previews.peek(box, selection.id, thread: selection.thread);
    return MailReader(
      renderedDocuments: _renderedDocuments,
      key: ValueKey('mail-reader:$box:${selection.id}'),
      repository: _repository,
      workspaceId: widget.workspaceId,
      mailboxId: box,
      sourceFolder: selection.folder,
      folders: _folders,
      detail: cached?.detail,
      summary: selection.item,
      loadDetail: () =>
          _previews.load(box, selection.id, thread: selection.thread),
      onClose: pane ? _closeSelection : null,
      pushRoute: pane ? _pushChild : null,
      // Bodies shown from memory or the encrypted snapshot are revalidated
      // once on open; the reader also revalidates a snapshot it hydrates.
      refreshOnOpen: cached != null && selection.thread,
      notificationEntry: selection.notificationEntry,
      onReadFailed: () {
        // Roll back only the originating row in its original list; a filter,
        // search or folder change since then shows a different list, and
        // concurrent changes to other rows stay intact.
        if (!mounted ||
            box != _mailboxId ||
            selection.listKey != _visibleListKey ||
            _pendingReaderIds.containsKey(selection.id) ||
            _pendingDeferredIds.containsKey(selection.id)) {
          return;
        }
        final originalIndex = selection.beforeRead.indexWhere(
          (row) => row['id'] == selection.id,
        );
        if (originalIndex < 0) return;
        final originalRow = selection.beforeRead[originalIndex];
        final currentIndex = _items.indexWhere(
          (row) => row['id'] == selection.id,
        );
        final updated = [..._items];
        if (currentIndex >= 0) {
          updated[currentIndex] = originalRow;
        } else {
          updated.insert(originalIndex.clamp(0, updated.length), originalRow);
        }
        _updateState(() => _items = updated);
      },
      onOptimisticAction: (action, id) {
        if (!mounted || box != _mailboxId) return;
        _pendingReaderIds[id] = (mailbox: box, action: action);
        ++_generation;
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
      },
      onDeferCloseAction: selection.folder == 'inbox'
          ? (
              action,
              id, {
              required starred,
              required unread,
              required lastMessageAt,
            }) {
              if (!mounted || box != _mailboxId) return false;
              // Undo returns the row the visible list shows at this point,
              // with the reader's star and read state. The list can differ
              // from the one the conversation was opened in, and the row is
              // absent when the open or a change in the reader took it out
              // of the visible filter.
              final index = _items.indexWhere((row) => row['id'] == id);
              var shown = [if (index >= 0) _items[index]];
              // The reader's own load is what the user saw; a reader opened
              // from a notification has no list row to fall back on.
              final heldActivity =
                  lastMessageAt ??
                  (shown.firstOrNull ?? selection.item)['lastMessageAt'];
              for (final state in [
                if (starred) 'star' else 'unstar',
                if (unread) 'mark_unread' else 'mark_read',
              ]) {
                shown = optimisticMailItems(
                  shown,
                  {id},
                  action: state,
                  folder: _folder,
                  query: _query,
                );
              }
              _pendingReaderIds.remove(id);
              _pendingDeferredIds[id] = (mailbox: box, action: action);
              ++_generation;
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
                  folder: _folder,
                  listKey: _visibleListKey,
                  id: id,
                  threads: selection.thread,
                  inverse: 'restore',
                  deferredItem: shown.firstOrNull,
                  deferredIndex: index >= 0 ? index : 0,
                  heldActivity: heldActivity,
                  commit: () => _repository.changeState(
                    widget.workspaceId,
                    box,
                    id,
                    action,
                    thread: selection.thread,
                  ),
                ),
              );
              return true;
            }
          : null,
      onActionSettled: ({required action, required id, required success}) {
        _pendingReaderIds.remove(id);
        if (!mounted || box != _mailboxId) return;
        if (!success) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(context.l10n.mailActionFailed)),
          );
        } else if (action == 'archive' || action == 'trash') {
          // The reader closed optimistically; its Archive and Delete get
          // the same Undo as a swipe.
          _presentOrQueueFeedback(
            _PendingMailFeedback(
              message: action == 'archive'
                  ? context.l10n.mailFeedbackArchived
                  : context.l10n.mailFeedbackTrashed,
              box: box,
              folder: selection.folder,
              listKey: selection.listKey,
              id: id,
              threads: selection.thread,
              inverse: selection.folder == 'inbox' ? 'restore' : null,
            ),
          );
        }
        if (_visibleMailboxSettled) unawaited(_load());
      },
      thread: selection.thread,
      canSend: _canSend,
      fromAddress: _mailbox['address'] as String? ?? '',
      signatureText: _mailbox['signatureText'] as String?,
      signatureHtml: _mailbox['signatureHtml'] as String?,
    );
  }

  Widget? _buildDetailPane() {
    final selection = _activeSelection;
    return selection == null ? null : _buildReader(selection, pane: true);
  }

  /// Rows report themselves while they are within the list's viewport (plus
  /// its cache extent). Prefetching waits for scrolling to pause.
  void _rowVisibilityChanged(String id, {required bool visible}) {
    if (visible ? !_visibleIds.add(id) : !_visibleIds.remove(id)) return;
    _previews.cancel();
    _prefetchDebounce?.cancel();
    _prefetchDebounce = Timer(
      const Duration(milliseconds: 250),
      _prefetchVisible,
    );
  }

  void _prefetchVisible() {
    final box = _mailboxId;
    if (!mounted || box == null || !_canPrefetch) return;
    final ids = [
      for (final item in _items)
        if (_visibleIds.contains(item['id'])) item['id'] as String,
    ];
    _previews.prefetch(box, ids, thread: _threads);
  }

  /// Starts loading a row's body as the finger lands, ahead of the tap that
  /// opens it; the open shares the same request.
  void _warmPreview(Map<String, dynamic> item) {
    final box = _mailboxId;
    if (box == null || !_canPrefetch || _mutating || _selected.isNotEmpty) {
      return;
    }
    final id = item['id'] as String;
    _prerender(id);
    unawaited(
      _previews
          .load(box, id, thread: _threads)
          .then<void>((_) {}, onError: (Object _) {}),
    );
  }

  /// After opening a row, its neighbours are the likely next reads. [rows]
  /// is the list as opened: a filter can take the opened row out of it.
  void _prefetchAround(String id, List<Map<String, dynamic>> rows) {
    final box = _mailboxId;
    if (box == null || !_canPrefetch) return;
    final index = rows.indexWhere((item) => item['id'] == id);
    if (index < 0) return;
    final neighbours = [
      for (final i in [index + 1, index - 1, index + 2])
        if (i >= 0 && i < rows.length) rows[i]['id'] as String,
    ];
    // The next and previous conversations also get their body rendered.
    neighbours.take(2).forEach(_prerender);
    _previews.prefetch(box, neighbours, thread: _threads);
  }

  // Drafts open the composer, and an unverified cached view must not fetch.
  bool get _canPrefetch =>
      _accessVerified && !_accessDenied && _folder != 'drafts';

  Future<void> _archiveViewedMailThread(
    String mailboxId,
    String threadId,
  ) async {
    try {
      final archived = await _notificationsRepository.archiveViewedMailThread(
        mailboxId: mailboxId,
        threadId: threadId,
      );
      if (archived > 0) PushNotificationService.instance.notifyArchiveChanged();
    } on Object {
      // Reading Mail stays immediate if notification sync is unavailable.
    }
  }
}

/// Reports when an inbox row enters or leaves the built viewport.
class _MailRowVisibility extends StatefulWidget {
  const _MailRowVisibility({
    required this.id,
    required this.onChanged,
    required this.child,
    super.key,
  });

  final String id;
  final void Function(String id, {required bool visible}) onChanged;
  final Widget child;

  @override
  State<_MailRowVisibility> createState() => _MailRowVisibilityState();
}

class _MailRowVisibilityState extends State<_MailRowVisibility> {
  @override
  void initState() {
    super.initState();
    widget.onChanged(widget.id, visible: true);
  }

  @override
  void didUpdateWidget(covariant _MailRowVisibility oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.id != widget.id) {
      oldWidget.onChanged(oldWidget.id, visible: false);
      widget.onChanged(widget.id, visible: true);
    }
  }

  @override
  void dispose() {
    widget.onChanged(widget.id, visible: false);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
