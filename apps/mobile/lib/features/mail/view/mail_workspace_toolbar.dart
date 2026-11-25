part of 'mail_page.dart';

extension _MailWorkspaceToolbar on _MailWorkspaceState {
  void _toggleSelection(String id) {
    if (_mutating || !_accessVerified) return;
    _updateState(() {
      if (!_selected.remove(id)) _selected.add(id);
    });
  }

  Widget _buildMailBulkToolbar() {
    final l10n = context.l10n;
    return AppHorizontalScrollView(
      child: Row(
        children: [
          Padding(
            padding: const EdgeInsets.all(8),
            child: Text('${_selected.length}'),
          ),
          IconButton(
            tooltip: l10n.mailSelectAll,
            onPressed: () => _updateState(
              () => _selected.addAll(
                _items.map((i) => i['id'] as String),
              ),
            ),
            icon: const Icon(Icons.select_all),
          ),
          IconButton(
            tooltip: l10n.mailArchive,
            onPressed: () => _bulk('archive'),
            icon: const Icon(Icons.archive_outlined),
          ),
          IconButton(
            tooltip: l10n.mailTrash,
            onPressed: () => _bulk('trash'),
            icon: const Icon(Icons.delete_outline),
          ),
          IconButton(
            tooltip: l10n.mailMarkAllRead,
            onPressed: () => _bulk('mark_read'),
            icon: const Icon(
              Icons.mark_email_read_outlined,
            ),
          ),
          if (_labels.isNotEmpty)
            PopupMenuButton<String>(
              tooltip: l10n.mailLabels,
              icon: const Icon(Icons.label_outline),
              onSelected: (id) =>
                  _bulk('add_label', labelId: id),
              itemBuilder: (_) => _labels
                  .map(
                    (l) => PopupMenuItem(
                      value: l['id'] as String,
                      child: Row(
                        children: [
                          const Icon(
                            Icons.label_outline,
                          ),
                          const SizedBox(width: 12),
                          Text(l['name'] as String),
                        ],
                      ),
                    ),
                  )
                  .toList(),
            ),
          IconButton(
            tooltip: l10n.commonCancel,
            onPressed: () =>
                _updateState(_selected.clear),
            icon: const Icon(Icons.close),
          ),
        ],
      ),
    );
  }
}
