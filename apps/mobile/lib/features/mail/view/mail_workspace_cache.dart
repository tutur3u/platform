part of 'mail_page.dart';

extension _MailWorkspaceCache on _MailWorkspaceState {
  Future<void> _warmVisibleThreads(int generation, String box) async {
    if (!_threads || !_accessVerified) return;
    // Prefetch six visible threads in two small batches. Sequential requests
    // made opening the next email wait unnecessarily for earlier messages.
    final ids = _items.take(6).map((item) => item['id'] as String).toList();
    for (var start = 0; start < ids.length; start += 3) {
      if (!mounted || generation != _generation || box != _mailboxId) return;
      await Future.wait(
        ids.skip(start).take(3).map((id) async {
          try {
            await _repository.detail(widget.workspaceId, box, id, thread: true);
          } on ApiException catch (error) {
            if (mounted &&
                generation == _generation &&
                !_accessDenied &&
                (error.statusCode == 401 || error.statusCode == 403)) {
              await _denyCachedAccess();
            }
          } on Object {
            // A warm-up failure must not interrupt the inbox.
          }
        }),
      );
    }
  }

  Future<void> _restoreView(int generation) async {
    if (_cacheRestored) return;
    _cacheRestored = true;
    try {
      final saved = await _repository.savedView(widget.workspaceId);
      if (!mounted || generation != _bootstrapGeneration || saved == null) {
        return;
      }
      // Validate the entire snapshot before applying any part of it.
      final mailboxes = mailRows(saved['mailboxes']);
      final mailboxId = saved['mailboxId'] as String?;
      final folder = saved['folder'] as String? ?? 'inbox';
      final labelId = saved['labelId'] as String?;
      final folderId = saved['folderId'] as String?;
      final labels = mailRows(saved['labels']);
      final folders = mailRows(saved['folders']);
      final query = saved['query'] as String? ?? '';
      final items = mailRows(saved['items']);
      final listKey = saved['listKey'] as String?;
      if (items.any((item) => !_validCachedItem(item)) ||
          mailboxId == null ||
          !mailboxes.any((box) => box['id'] == mailboxId) ||
          mailboxes.any(
            (box) => box['id'] is! String || box['address'] is! String,
          ) ||
          !const {
            'inbox',
            'snoozed',
            'muted',
            'sent',
            'drafts',
            'starred',
            'archive',
            'spam',
            'trash',
          }.contains(folder)) {
        return;
      }
      _updateState(() {
        _mailboxes = mailboxes;
        _mailboxId = mailboxId;
        _folder = folder;
        _labelId = labels.any((label) => label['id'] == labelId)
            ? labelId
            : null;
        _folderId = folders.any((folder) => folder['id'] == folderId)
            ? folderId
            : null;
        _labels = labels;
        _folders = folders;
        _search.text = query;
        _items = items;
        _visibleListKey = listKey;
        _hasMore = false;
      });
    } on Object {
      // A corrupt snapshot never prevents loading the canonical inbox.
    }
  }

  void _saveView() {
    if (!_accessVerified || _accessDenied || _mailboxId == null) return;
    // Display fields only. Permissions and send-as policies must be fetched.
    final mailboxes = _mailboxes
        .map(
          (box) => <String, dynamic>{
            'id': box['id'],
            'address': box['address'],
            'name': box['name'],
          },
        )
        .toList(growable: false);
    unawaited(
      _repository
          .saveView(widget.workspaceId, {
            'mailboxes': mailboxes,
            'mailboxId': _mailboxId,
            'folder': _folder,
            'labelId': _labelId,
            'folderId': _folderId,
            'query': _search.text.trim(),
            'labels': _labels,
            'folders': _folders,
            'items': _items.take(30).toList(growable: false),
            'listKey': _visibleListKey,
          })
          .catchError((Object _) {}),
    );
  }

  Future<void> _denyCachedAccess() async {
    _accessDenied = true;
    _generation++;
    _organizationGeneration++;
    _accessVerified = false;
    if (mounted) {
      _updateState(() {
        _mailboxes = [];
        _mailboxId = null;
        _items = [];
        _labels = [];
        _folders = [];
        _labelId = null;
        _folderId = null;
        _selected.clear();
        _hasMore = false;
        _loading = false;
        _failed = true;
      });
    }
    await _repository.denyAccess(widget.workspaceId);
  }
}

bool _validCachedItem(Map<String, dynamic> item) {
  if (item['id'] is! String) return false;
  if (item['unreadCount'] != null && item['unreadCount'] is! int) return false;
  for (final key in const [
    'subject',
    'fromName',
    'fromAddress',
    'lastMessageAt',
    'sentAt',
    'receivedAt',
    'createdAt',
    'latestSnippet',
    'snippet',
    'deliveryRecipient',
  ]) {
    if (item[key] != null && item[key] is! String) return false;
  }
  return true;
}
