part of 'drive_page.dart';

/// Opening an entry: a folder becomes the listed path, a file opens its
/// preview over the list.
extension _DrivePagePreview on _DrivePageState {
  Future<void> _openEntry(DriveEntry entry) async {
    final wsId = _wsId;
    final actorId = _actorId;
    final token = _requestToken;
    if (wsId == null) return;
    if (entry.isFolder) {
      _update(() {
        _path = _path.isEmpty ? entry.name : '$_path/${entry.name}';
        _selectedNames.clear();
      });
      await _reload();
      return;
    }

    try {
      final signedUrl = await _repository.createSignedUrl(
        wsId,
        path: _path.isEmpty ? entry.name : '$_path/${entry.name}',
      );
      if (!mounted || !_isCurrentRequest(token, wsId, actorId)) return;
      // The list's dock actions and folder chip step aside while the
      // preview covers the list, so only the preview's chrome is live.
      _update(() => _previewOpen = true);
      try {
        // Unregister them before the list goes offstage.
        await WidgetsBinding.instance.endOfFrame;
        if (!mounted) return;
        await Navigator.of(context).push<void>(
          MaterialPageRoute(
            builder: (_) =>
                DrivePreviewPage(title: entry.name, signedUrl: signedUrl),
          ),
        );
      } finally {
        if (mounted) _update(() => _previewOpen = false);
      }
    } on ApiException catch (error) {
      if (!mounted || !_isCurrentRequest(token, wsId, actorId)) return;
      _toast(error.message, destructive: true);
    }
  }
}
