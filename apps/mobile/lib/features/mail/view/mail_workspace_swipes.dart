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
    final unread =
        item['unread'] == true || (item['unreadCount'] as int? ?? 0) > 0;
    final starred = item['starred'] == true;
    var action = switch (swipe) {
      MailSwipeAction.archive => _folder == 'archive' ? 'restore' : 'archive',
      MailSwipeAction.trash => 'trash',
      MailSwipeAction.read => unread ? 'mark_read' : 'mark_unread',
      MailSwipeAction.star => starred ? 'unstar' : 'star',
      MailSwipeAction.move => 'move_to_folder',
      MailSwipeAction.none => '',
    };
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
    _updateState(() {
      _mutating = true;
      _loading = false;
      _items = optimisticMailItems(
        _items,
        {id},
        action: action,
        folder: _folder,
        query: _search.text,
      );
    });
    try {
      await _repository.bulk(
        widget.workspaceId,
        box,
        [id],
        action,
        threads: threads,
        folderId: folderId,
      );
      if (!mounted || generation != _generation || box != _mailboxId) return;
      _saveView();
      final inverse = switch (action) {
        'mark_read' => 'mark_unread',
        'mark_unread' => 'mark_read',
        'star' => 'unstar',
        'unstar' => 'star',
        'archive' || 'trash' when _folder == 'inbox' => 'restore',
        _ => null,
      };
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(swipe.label(context)),
          action: inverse == null
              ? null
              : SnackBarAction(
                  label: context.l10n.mailSwipeUndo,
                  onPressed: () async {
                    if (!mounted || _mailboxId != box || _mutating) return;
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
                      if (mounted) _updateState(() => _mutating = false);
                    }
                  },
                ),
        ),
      );
    } on Object {
      if (!mounted || generation != _generation) return;
      _updateState(() => _items = before);
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(context.l10n.mailActionFailed)));
    } finally {
      if (mounted && generation == _generation) {
        _updateState(() => _mutating = false);
        unawaited(_load());
      }
    }
  }
}
