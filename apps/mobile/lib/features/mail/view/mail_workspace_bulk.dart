part of 'mail_page.dart';

/// Selection and folder-wide changes. Each one first submits the writes still
/// inside an Undo window and waits for them, so it reaches the server after
/// the Archive or Delete it follows and starts from the list as those writes
/// left it. The optimistic change applies only while the list the user acted
/// on is still the visible one. The write goes to the mailbox and folder the
/// user acted on, whichever list is visible by then. Each ends by reloading
/// the list.
extension _MailWorkspaceBulk on _MailWorkspaceState {
  /// Holds the list's controls while the held writes land. False when the
  /// change may no longer be sent: the view is gone, or its access or
  /// account no longer stands.
  Future<bool> _beginMutation() async {
    _updateState(() => _mutating = true);
    await _settleDeferredWrites();
    if (!mounted) return false;
    if (_canSubmitWrites) return true;
    _updateState(() => _mutating = false);
    return false;
  }

  Future<void> _bulk(String action, {String? labelId, String? folderId}) async {
    final box = _mailboxId;
    if (_mutating || _selected.isEmpty || box == null) return;
    final threads = _threads;
    final selected = Set<String>.of(_selected);
    final listKey = _visibleListKey;
    if (!await _beginMutation()) return;
    final sameList = listKey == _visibleListKey;
    final previous = _items;
    final generation = sameList ? ++_generation : _generation;
    if (sameList) {
      _updateState(() {
        _loading = false;
        _items = optimisticMailItems(
          _items,
          selected,
          action: action,
          folder: _folder,
          query: _query,
        );
        _selected.clear();
      });
    }
    try {
      await _repository.bulk(
        widget.workspaceId,
        box,
        selected.toList(),
        action,
        threads: threads,
        labelId: labelId,
        folderId: folderId,
      );
    } on Object {
      if (mounted) {
        if (sameList && generation == _generation) {
          _updateState(() {
            _items = previous;
            _selected.addAll(selected);
          });
        }
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(context.l10n.commonSomethingWentWrong)),
        );
      }
    } finally {
      if (mounted) await _load();
      if (mounted) _updateState(() => _mutating = false);
    }
  }

  Future<void> _markAllRead() async {
    final box = _mailboxId;
    if (_mutating || box == null) return;
    final folder = _folder;
    final listKey = _visibleListKey;
    if (!await _beginMutation()) return;
    final sameList = listKey == _visibleListKey;
    final previous = _items;
    final generation = sameList ? ++_generation : _generation;
    if (sameList) {
      _updateState(() {
        _loading = false;
        _items = optimisticMailItems(
          _items,
          _items.map((item) => item['id'] as String).toSet(),
          action: 'mark_read',
          folder: _folder,
          query: _query,
        );
      });
    }
    try {
      await _repository.markFolderRead(widget.workspaceId, box, folder);
    } on Object {
      if (mounted) {
        if (sameList && generation == _generation) {
          _updateState(() => _items = previous);
        }
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(context.l10n.mailActionFailed)));
      }
    } finally {
      if (mounted) {
        _updateState(() => _mutating = false);
        // A search or page loaded during the wait predates these writes.
        if (box == _mailboxId) unawaited(_load());
      }
    }
  }
}
