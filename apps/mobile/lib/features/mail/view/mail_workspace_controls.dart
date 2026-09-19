part of 'mail_page.dart';

extension _MailWorkspaceControls on _MailWorkspaceState {
  Widget _buildMailControls(Widget folderPicker, bool sharedShell) {
    final l10n = context.l10n;
    final mailbox = DropdownButtonFormField<String>(
      initialValue: _mailboxId,
      isExpanded: true,
      decoration: InputDecoration(
        labelText: l10n.mailMailbox,
        isDense: true,
        border: InputBorder.none,
      ),
      items: _mailboxes
          .map(
            (box) => DropdownMenuItem(
              value: box['id'] as String,
              child: Text(
                box['address'] as String,
                overflow: TextOverflow.ellipsis,
              ),
            ),
          )
          .toList(),
      onChanged: (value) {
        _updateState(() {
          _mailboxId = value;
          _labelId = null;
          _folderId = null;
        });
        unawaited(_load());
      },
    );
    final search = TextField(
      controller: _search,
      focusNode: _searchFocus,
      textInputAction: TextInputAction.search,
      decoration: InputDecoration(
        hintText: l10n.mailSearch,
        filled: true,
        fillColor: Theme.of(
          context,
        ).colorScheme.surfaceContainerHighest.withValues(alpha: 0.5),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide.none,
        ),
        prefixIcon: const Icon(Icons.search),
        suffixIcon: IconButton(
          tooltip: l10n.mailSearch,
          onPressed: _load,
          icon: const Icon(Icons.arrow_forward),
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
    );
    return LayoutBuilder(
      builder: (context, constraints) {
        if (constraints.maxWidth >= 700) {
          return Row(
            children: [
              if (sharedShell) ...[folderPicker, const SizedBox(width: 16)],
              if (_mailboxes.isNotEmpty) ...[
                Flexible(child: mailbox),
                const SizedBox(width: 16),
              ],
              Expanded(child: search),
            ],
          );
        }
        return Column(
          children: [
            if (sharedShell)
              Align(alignment: Alignment.centerLeft, child: folderPicker),
            if (_mailboxes.isNotEmpty) mailbox,
            const SizedBox(height: 6),
            search,
          ],
        );
      },
    );
  }
}
