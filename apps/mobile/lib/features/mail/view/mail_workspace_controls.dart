part of 'mail_page.dart';

extension _MailWorkspaceControls on _MailWorkspaceState {
  Future<String?> _chooseMailOption(
    String title,
    Map<String, String> options,
    String? selected,
  ) => showAdaptiveSheet<String>(
    context: context,
    useRootNavigator: true,
    builder: (sheetContext) => AppDialogScaffold(
      title: title,
      child: Material(
        color: Colors.transparent,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            for (final option in options.entries)
              ListTile(
                title: Text(option.value),
                selected: selected == option.key,
                trailing: selected == option.key
                    ? const Icon(Icons.check)
                    : null,
                onTap: () => Navigator.of(sheetContext).pop(option.key),
              ),
          ],
        ),
      ),
    ),
  );

  Widget _pickerButton({
    required String label,
    required IconData icon,
    required VoidCallback onPressed,
  }) => IconButton(
    tooltip: label,
    onPressed: _mutating ? null : onPressed,
    icon: Row(
      mainAxisSize: MainAxisSize.min,
      children: [Icon(icon, size: 22), const Icon(Icons.expand_more, size: 16)],
    ),
  );

  Future<void> _chooseMailbox() async {
    final l10n = context.l10n;
    final value = await _chooseMailOption(l10n.mailMailbox, {
      for (final box in _mailboxes)
        box['id'] as String: box['address'] as String,
    }, _mailboxId);
    if (!mounted || value == null || value == _mailboxId) return;
    _updateState(() {
      _mailboxId = value;
      _labelId = null;
      _folderId = null;
      _selected.clear();
    });
    unawaited(_load(forceRefresh: false));
  }

  Future<void> _chooseFilter() async {
    final l10n = context.l10n;
    final value = await _chooseMailOption(
      l10n.mailLabels,
      {
        '': l10n.mailAllLabels,
        for (final label in _labels)
          'label:${label['id']}': label['name'] as String,
        for (final folder in _folders)
          'folder:${folder['id']}': folder['name'] as String,
      },
      _labelId != null
          ? 'label:$_labelId'
          : _folderId != null
          ? 'folder:$_folderId'
          : '',
    );
    if (!mounted || value == null) return;
    _updateState(() {
      _labelId = value.startsWith('label:') ? value.substring(6) : null;
      _folderId = value.startsWith('folder:') ? value.substring(7) : null;
      _selected.clear();
    });
    unawaited(_load(forceRefresh: false));
  }

  Widget _buildMailControls(Widget folderPicker, bool sharedShell) {
    final l10n = context.l10n;
    return Column(
      children: [
        if (!sharedShell)
          Row(
            children: [
              folderPicker,
              _pickerButton(
                label: l10n.mailMailbox,
                icon: Icons.alternate_email,
                onPressed: _chooseMailbox,
              ),
              _pickerButton(
                label: l10n.mailLabels,
                icon: Icons.filter_alt_outlined,
                onPressed: _chooseFilter,
              ),
              IconButton(
                tooltip: l10n.mailSearch,
                onPressed: () =>
                    _updateState(() => _searchVisible = !_searchVisible),
                icon: const Icon(Icons.search),
              ),
            ],
          ),
        AnimatedSize(
          duration: const Duration(milliseconds: 220),
          reverseDuration: const Duration(milliseconds: 220),
          curve: Curves.easeInOutCubic,
          child: _searchVisible || _search.text.isNotEmpty
              ? TextField(
                  controller: _search,
                  focusNode: _searchFocus,
                  textInputAction: TextInputAction.search,
                  decoration: InputDecoration(
                    hintText: l10n.mailSearch,
                    isDense: true,
                    prefixIcon: const Icon(Icons.search),
                    suffixIcon: IconButton(
                      tooltip: l10n.commonCancel,
                      icon: const Icon(Icons.close),
                      onPressed: () {
                        _searchDebounce?.cancel();
                        _search.clear();
                        _searchFocus.unfocus();
                        _updateState(() => _searchVisible = false);
                        unawaited(_load(forceRefresh: false));
                      },
                    ),
                  ),
                  onChanged: (_) {
                    _searchDebounce?.cancel();
                    _searchDebounce = Timer(
                      const Duration(milliseconds: 300),
                      () => unawaited(_load(forceRefresh: false)),
                    );
                  },
                  onSubmitted: (_) {
                    _searchDebounce?.cancel();
                    unawaited(_load());
                  },
                )
              : const SizedBox.shrink(),
        ),
      ],
    );
  }
}
