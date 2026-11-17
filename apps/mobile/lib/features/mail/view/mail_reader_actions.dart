part of 'mail_reader.dart';

extension _MailReaderActions on _MailReaderState {
  Map<String, dynamic>? _person(String? address) =>
      _people[address?.trim().toLowerCase()];

  Map<String, dynamic>? get _messageStateMetadata =>
      widget.thread ? (_detail?['thread'] as Map<String, dynamic>?) : _detail;

  bool get _messageSnoozed =>
      _snoozedOverride ?? (_messageStateMetadata?['snoozedUntil'] != null);
  bool get _quarantined =>
      _messages.isNotEmpty &&
      _messages.every((message) => message['status'] == 'quarantined');
  bool get _canRestore =>
      !_quarantined && const {'archive', 'trash'}.contains(widget.sourceFolder);

  Widget _readerActions() {
    final l10n = context.l10n;
    final unread =
        _unreadOverride ??
        _messages.any((message) => message['unread'] == true);
    final snoozed = _messageSnoozed;
    final archived = _canRestore;
    final actions = <(IconData, String, VoidCallback)>[
      (
        Icons.snooze_outlined,
        snoozed ? l10n.mailUnsnooze : l10n.mailSnooze,
        () => _action(snoozed ? 'unsnooze' : 'snooze'),
      ),
      (Icons.label_outline, l10n.mailLabels, _readerLabels),
      (
        Icons.mark_email_read_outlined,
        unread ? l10n.mailMarkRead : l10n.mailMarkUnread,
        () => _action(unread ? 'mark_read' : 'mark_unread'),
      ),
      (
        _starred ? Icons.star : Icons.star_border,
        _starred ? l10n.mailUnstar : l10n.mailStar,
        () => _action(_starred ? 'unstar' : 'star'),
      ),
      if (!_quarantined)
        (
          Icons.archive_outlined,
          archived ? l10n.mailRestore : l10n.mailArchive,
          () => _action(archived ? 'restore' : 'archive', close: true),
        ),
      if (widget.sourceFolder != 'trash' && !_quarantined)
        (
          Icons.delete_outline,
          l10n.mailTrash,
          () => _action('trash', close: true),
        ),
    ];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (_peopleFailed)
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton.icon(
              onPressed: _peopleLoading ? null : _resolvePeople,
              icon: const Icon(Icons.refresh),
              label: Text(l10n.mailRetryProfiles),
            ),
          ),
        Wrap(
          alignment: WrapAlignment.spaceBetween,
          children: [
            for (final (icon, label, onPressed) in actions)
              IconButton(
                tooltip: label,
                constraints: const BoxConstraints(minWidth: 44, minHeight: 44),
                onPressed:
                    _busy ||
                        (_readPending && icon == Icons.mark_email_read_outlined)
                    ? null
                    : onPressed,
                icon: Icon(icon, size: 20),
              ),
          ],
        ),
      ],
    );
  }

  Widget _readerTabs() => Padding(
    padding: const EdgeInsets.symmetric(vertical: AppSpacing.md),
    child: AppSegmentedControl<bool>(
      segments: [
        AppSegment(value: false, label: context.l10n.mailConversation),
        AppSegment(value: true, label: context.l10n.mailAttachments),
      ],
      selected: _attachmentsTab,
      onChanged: (value) => _updateState(() => _attachmentsTab = value),
    ),
  );

  Widget _attachmentList() {
    final files = [
      for (final message in _messages)
        for (final file in mailRows(message['attachments'])) (message, file),
    ];
    if (files.isEmpty) return Text(context.l10n.mailNoAttachments);
    return Column(
      children: [
        for (var i = 0; i < files.length; i++)
          MailAttachmentTile(
            key: ValueKey('${files[i].$1['id']}:${files[i].$2['id']}'),
            repository: widget.repository,
            workspaceId: widget.workspaceId,
            mailboxId: widget.mailboxId,
            messageId: files[i].$1['id'] as String,
            file: files[i].$2,
            loadThumbnail: i < 4,
            onPreview: _busy || !canPreviewMailAttachment(files[i].$2)
                ? null
                : () => _openChild(
                    MailAttachmentPreview(
                      repository: widget.repository,
                      workspaceId: widget.workspaceId,
                      mailboxId: widget.mailboxId,
                      messageId: files[i].$1['id'] as String,
                      file: files[i].$2,
                    ),
                  ),
            onDownload: _busy
                ? null
                : () => _download(files[i].$1, files[i].$2),
          ),
      ],
    );
  }

  Future<void> _readerLabels() async {
    final generation = _contentGeneration;
    final organization = widget.repository.organization(
      widget.workspaceId,
      widget.mailboxId,
    );
    final label = await showAdaptiveSheet<String>(
      context: context,
      useRootNavigator: true,
      builder: (sheetContext) => AppDialogScaffold(
        title: context.l10n.mailLabels,
        child: FutureBuilder<Map<String, dynamic>>(
          future: organization,
          builder: (context, snapshot) {
            if (snapshot.hasError) {
              return Text(context.l10n.mailActionFailed);
            }
            if (!snapshot.hasData) return const LinearProgressIndicator();
            return Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                for (final label in mailRows(snapshot.data!['labels']))
                  ListTile(
                    leading: const Icon(Icons.label_outline),
                    title: Text(label['name'] as String),
                    onTap: () =>
                        Navigator.of(sheetContext).pop(label['id'] as String),
                  ),
              ],
            );
          },
        ),
      ),
    );
    if (!mounted ||
        generation != _contentGeneration ||
        label == null ||
        _busy) {
      return;
    }
    _updateState(() => _busy = true);
    try {
      await widget.repository.bulk(
        widget.workspaceId,
        widget.mailboxId,
        [_id],
        'add_label',
        threads: widget.thread,
        labelId: label,
      );
    } on Object {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(context.l10n.mailActionFailed)));
      }
    } finally {
      if (mounted) _updateState(() => _busy = false);
    }
  }
}
