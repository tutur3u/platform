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
  });

  final Map<String, dynamic> item;
  final String mailboxId;
  final String folder;
  final bool thread;
  final bool notificationEntry;
  final List<Map<String, dynamic>> beforeRead;
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
  );

  /// Opens [item] without waiting for the network: the reader renders the
  /// inbox row (or the cached body) in the next frame and hydrates itself.
  Future<void> _open(
    Map<String, dynamic> item, {
    bool notificationEntry = false,
  }) async {
    final box = _mailboxId;
    if (box == null || (!_split && _childRouteOpen)) return;
    _dismissSwipeFeedback();
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
        query: _search.text,
      );
    });
    _prefetchAround(selection.id);
    if (!_split) await _presentReaderRoute(selection);
  }

  Future<void> _openDraft(Map<String, dynamic> item, String box) async {
    try {
      final draft = await _previews.load(
        box,
        item['id'] as String,
        thread: false,
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
        _pendingReaderIds.isEmpty) {
      unawaited(_load());
    }
  }

  /// Keeps one open selection when the body crosses the split width.
  void _onSplitChanged(bool split) {
    if (_split == split) return;
    _split = split;
    _syncSelectionWithLayout();
  }

  void _syncSelectionWithLayout() {
    final selection = _selection;
    if (!mounted || selection == null) return;
    final route = _readerRoute;
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
      key: ValueKey('mail-reader:$box:${selection.id}'),
      repository: _repository,
      workspaceId: widget.workspaceId,
      mailboxId: box,
      detail: cached,
      summary: selection.item,
      loadDetail: () =>
          _previews.load(box, selection.id, thread: selection.thread),
      onClose: pane ? _closeSelection : null,
      pushRoute: pane ? _pushChild : null,
      refreshOnOpen: cached != null && selection.thread,
      notificationEntry: selection.notificationEntry,
      onReadFailed: () {
        if (mounted && box == _mailboxId && selection.folder == _folder) {
          _updateState(() => _items = selection.beforeRead);
        }
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
            query: _search.text,
          );
        });
        _saveView();
      },
      onActionSettled: ({required action, required id, required success}) {
        _pendingReaderIds.remove(id);
        if (!mounted || box != _mailboxId) return;
        if (!success) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(context.l10n.mailActionFailed)),
          );
        }
        if (_pendingReaderIds.isEmpty) unawaited(_load());
      },
      thread: selection.thread,
      canSend: _canSend,
      fromAddress: _mailbox['address'] as String? ?? '',
      signatureText: _mailbox['signatureText'] as String?,
      signatureHtml: _mailbox['signatureHtml'] as String?,
    );
  }

  Widget? _buildDetailPane() {
    final selection = _selection;
    if (selection == null || selection.mailboxId != _mailboxId) return null;
    return _buildReader(selection, pane: true);
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

  /// After opening a row, its neighbours are the likely next reads.
  void _prefetchAround(String id) {
    final box = _mailboxId;
    if (box == null || !_canPrefetch) return;
    final index = _items.indexWhere((item) => item['id'] == id);
    if (index < 0) return;
    _previews.prefetch(box, [
      for (final i in [index + 1, index - 1, index + 2])
        if (i >= 0 && i < _items.length) _items[i]['id'] as String,
    ], thread: _threads);
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
