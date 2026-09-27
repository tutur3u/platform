part of 'notes_page.dart';

extension NotesPageActions on NotesPageState {
  Future<void> _archive() async {
    await _setArchived(true);
  }

  Future<void> _restore() async {
    await _setArchived(false);
  }

  Future<void> _setArchived(bool archived) async {
    final wsId = _wsId;
    final note = _selected;
    if (wsId == null || note == null) return;
    if (!(await _save())) return;
    try {
      await _repository.update(wsId, note, archived: archived);
      if (!mounted || _wsId != wsId || _selected?.id != note.id) return;
      _updateState(() {
        _notes = _notes.where((item) => item.id != note.id).toList();
        _selected = null;
        _selectedPassphrase = null;
        _editing = false;
      });
      unawaited(_refresh());
    } on Object {
      if (mounted) _updateState(() => _error = context.l10n.notesSaveError);
    }
  }

  Future<void> _delete() async {
    final wsId = _wsId;
    final note = _selected;
    if (wsId == null || note == null) return;
    final confirmed = await _showNotesSheet<bool>(
      builder: (sheetContext) => AppDialogScaffold(
        title: sheetContext.l10n.notesDelete,
        description: sheetContext.l10n.notesDeleteDescription,
        icon: Icons.delete_outline_rounded,
        child: Row(
          mainAxisAlignment: MainAxisAlignment.end,
          children: [
            TextButton(
              onPressed: () => Navigator.of(sheetContext).pop(false),
              child: Text(
                MaterialLocalizations.of(sheetContext).cancelButtonLabel,
              ),
            ),
            FilledButton(
              onPressed: () => Navigator.of(sheetContext).pop(true),
              child: Text(sheetContext.l10n.notesDelete),
            ),
          ],
        ),
      ),
    );
    if (confirmed != true || !mounted || _selected?.id != note.id) return;
    _saveTimer?.cancel();
    await _saveQueue;
    try {
      await _repository.delete(wsId, note.id);
      if (!mounted || _wsId != wsId || _selected?.id != note.id) return;
      _updateState(() {
        _notes = _notes.where((item) => item.id != note.id).toList();
        _selected = null;
        _selectedPassphrase = null;
        _editing = false;
        _dirty = false;
        _error = null;
      });
      unawaited(_refresh());
    } on Object {
      if (mounted) _updateState(() => _error = context.l10n.notesDeleteError);
    }
  }

  Future<void> _showNoteActions() async {
    final action = await _showNotesSheet<String>(
      builder: (sheetContext) => AppDialogScaffold(
        title: _title.text.trim().isEmpty
            ? sheetContext.l10n.notesUntitled
            : _title.text.trim(),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: Icon(
                _selected?.locked == true
                    ? Icons.lock_open_rounded
                    : Icons.lock_outline_rounded,
              ),
              title: Text(
                _selected?.locked == true
                    ? sheetContext.l10n.notesUnlock
                    : sheetContext.l10n.notesLock,
              ),
              onTap: () => Navigator.of(
                sheetContext,
              ).pop(_selected?.locked == true ? 'unlock' : 'lock'),
            ),
            if (_tab == NotesTab.inbox)
              ListTile(
                leading: const Icon(Icons.archive_outlined),
                title: Text(sheetContext.l10n.notesArchive),
                onTap: () => Navigator.of(sheetContext).pop('archive'),
              )
            else
              ListTile(
                leading: const Icon(Icons.unarchive_outlined),
                title: Text(sheetContext.l10n.notesRestore),
                onTap: () => Navigator.of(sheetContext).pop('restore'),
              ),
            ListTile(
              leading: const Icon(Icons.delete_outline_rounded),
              title: Text(sheetContext.l10n.notesDelete),
              onTap: () => Navigator.of(sheetContext).pop('delete'),
            ),
          ],
        ),
      ),
    );
    if (!mounted) return;
    if (action == 'lock') await _lock();
    if (action == 'unlock') await _removeLock();
    if (action == 'archive') await _archive();
    if (action == 'restore') await _restore();
    if (action == 'delete') await _delete();
  }
}
