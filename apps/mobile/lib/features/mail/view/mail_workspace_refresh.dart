part of 'mail_page.dart';

extension _MailWorkspaceRefresh on _MailWorkspaceState {
  void _refreshVisibleMailbox() {
    if (mounted &&
        _accessVerified &&
        !_mutating &&
        !_loading &&
        _openingId == null &&
        _pendingReaderIds.isEmpty) {
      // The inbox remains alive below its reader: refresh while reading too.
      unawaited(_load());
    }
  }

  Future<void> _bootstrap() async {
    final generation = ++_bootstrapGeneration;
    _updateState(() {
      _loading = true;
      _failed = false;
    });
    await _restoreView(generation);
    try {
      final result = await _repository.bootstrap(widget.workspaceId);
      if (!mounted || generation != _bootstrapGeneration) return;
      _updateState(() {
        _mailboxes = mailRows(result['mailboxes']);
        _accessVerified = true;
        if (!_mailboxes.any((box) => box['id'] == _mailboxId)) {
          _mailboxId = _mailboxes.firstOrNull?['id'] as String?;
          _items = [];
          _labelId = null;
          _folderId = null;
        }
      });
      if (_mailboxes.isEmpty) {
        await _repository.saveView(widget.workspaceId, {
          'mailboxes': <Map<String, dynamic>>[],
          'items': <Map<String, dynamic>>[],
        });
      }
      final destination = _pushDestinationHandled ? null : widget.destination;
      final canOpenDestination =
          destination != null &&
          _mailboxes.any((box) => box['id'] == destination.mailboxId);
      if (canOpenDestination) {
        _updateState(() {
          final sameInbox =
              _mailboxId == destination.mailboxId &&
              _folder == 'inbox' &&
              _labelId == null &&
              _folderId == null &&
              _search.text.trim().isEmpty;
          _mailboxId = destination.mailboxId;
          _folder = 'inbox';
          _labelId = null;
          _folderId = null;
          _search.clear();
          if (!sameInbox) {
            _items = [];
            _listResolved = false;
            _visibleListKey = null;
          }
        });
      }
      if (canOpenDestination) {
        unawaited(_load());
        _pushDestinationHandled = true;
        await _open({'id': destination.threadId});
      } else {
        await _load();
      }
    } on Object catch (error) {
      if (!mounted || generation != _bootstrapGeneration) return;
      if (error is ApiException &&
          (error.statusCode == 401 || error.statusCode == 403)) {
        await _denyCachedAccess();
      }
      if (mounted) {
        _updateState(() {
          _failed = true;
          _loading = false;
        });
      }
    }
  }
}
