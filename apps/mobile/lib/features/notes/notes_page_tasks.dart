part of 'notes_page.dart';

extension NotesPageTasks on NotesPageState {
  Future<void> _convertChecklistToTask() async {
    final wsId = _wsId;
    if (wsId == null || _selected == null) return;
    final item = selectedChecklistItem(_editor);
    if (item == null) {
      _updateState(() => _error = context.l10n.notesSelectChecklistItem);
      return;
    }
    if (!(await _save()) || !mounted || _wsId != wsId) return;
    final taskId = await _showNotesSheet<String>(
      maxDialogWidth: 540,
      builder: (_) => NoteTaskConversionSheet(wsId: wsId, taskName: item.text),
    );
    if (taskId == null || !mounted || _wsId != wsId) return;
    _editor.replaceText(
      item.start,
      item.length,
      Embeddable(
        'mention',
        jsonEncode({
          'entityId': taskId,
          'entityType': 'task',
          'displayName': item.text,
          'workspaceId': wsId,
        }),
      ),
      TextSelection.collapsed(offset: item.start + 1),
    );
    await _save();
  }
}
