part of 'mail_reader.dart';

extension _MailReaderMutations on _MailReaderState {
  Future<void> _action(String action, {bool close = false}) async {
    final generation = _contentGeneration;
    if (_detail == null || (_busy && action != 'mark_read')) return;
    if (action == 'mark_read' || action == 'mark_unread') {
      if (_readPending) return;
      _updateState(() => _readPending = true);
    }
    DateTime? snoozedUntil;
    if (action == 'snooze') {
      snoozedUntil = await chooseMailSnoozeTime(context);
      if (!mounted ||
          generation != _contentGeneration ||
          snoozedUntil == null) {
        return;
      }
    }
    final previousStarred = _starred;
    final id = _id;
    final optimisticClose =
        close &&
        (action == 'archive' || action == 'trash' || action == 'restore');
    final onActionSettled = widget.onActionSettled;
    if (action != 'mark_read' && !optimisticClose) {
      _updateState(() {
        _busy = true;
        if (action == 'star' || action == 'unstar') _starred = action == 'star';
      });
    }
    if (optimisticClose) {
      // Hand the dock back to Mail now, before the reader's pop animation.
      _busy = true;
      widget.onOptimisticAction?.call(action, id);
      lookupShellMiniNavCubit(context)?.dismissOwner('mail-reader');
      try {
        context.read<ShellChromeActionsCubit>().dismissOwner('mail-reader');
      } on ProviderNotFoundException {
        // Standalone reader tests and screens need no shared dock handoff.
      }
      _close();
    }
    try {
      await widget.repository.changeState(
        widget.workspaceId,
        widget.mailboxId,
        id,
        action,
        thread: widget.thread,
        snoozedUntil: snoozedUntil,
      );
      if (optimisticClose) {
        onActionSettled?.call(action: action, id: id, success: true);
        return;
      }
      if (!mounted || generation != _contentGeneration) return;
      _updateState(() {
        if (action == 'mark_read' || action == 'mark_unread') {
          _unreadOverride = action == 'mark_unread';
        }
        if (action == 'snooze' || action == 'unsnooze') {
          _snoozedOverride = action == 'snooze';
        }
      });
      if (!mounted) return;
      if (close && !optimisticClose) {
        _close();
        return;
      }
    } on Object catch (error) {
      if (optimisticClose) {
        onActionSettled?.call(action: action, id: id, success: false);
        return;
      }
      if (!mounted || generation != _contentGeneration) return;
      if (action == 'mark_read') widget.onReadFailed?.call();
      if (error is ApiException &&
          (error.statusCode == 401 || error.statusCode == 403)) {
        await widget.repository.denyAccess(widget.workspaceId);
        if (mounted) _close();
        return;
      }
      if (action == 'mark_read') return;
      if (mounted) {
        if (action == 'star' || action == 'unstar') {
          _updateState(() => _starred = previousStarred);
        }
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(context.l10n.mailActionFailed)));
      }
    } finally {
      if (mounted &&
          generation == _contentGeneration &&
          (action == 'mark_read' || action == 'mark_unread')) {
        _updateState(() => _readPending = false);
      }
      if (mounted &&
          generation == _contentGeneration &&
          action != 'mark_read' &&
          !optimisticClose) {
        _updateState(() => _busy = false);
      }
    }
  }
}
