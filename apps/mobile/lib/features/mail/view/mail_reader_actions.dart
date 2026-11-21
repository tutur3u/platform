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

  List<(Map<String, dynamic>, Map<String, dynamic>)> get _attachments => [
    for (final message in _messages)
      for (final file in mailRows(message['attachments'])) (message, file),
  ];

  /// Message count, labels and the attachments toggle on one compact row.
  /// Message commands live on the dock and its More sheet.
  Widget _threadHeader() {
    final l10n = context.l10n;
    final tokens = AppTokens.of(context);
    final muted = Theme.of(
      context,
    ).textTheme.bodySmall?.copyWith(color: tokens.colorScheme.mutedForeground);
    final labels = mailRows(
      _messageStateMetadata?['labels'] ?? widget.summary?['labels'],
    );
    final attachments = _attachments.length;
    final children = <Widget>[
      if (widget.thread && _messages.length > 1)
        Text(
          l10n.mailThreadMessageCount(_messages.length),
          key: const ValueKey('mail-thread-count'),
          style: muted,
        ),
      for (final label in labels)
        if (label['name'] case final String name)
          AppBadge.outline(child: Text(name)),
      if (attachments > 0)
        AppChip(
          key: const ValueKey('mail-attachments-toggle'),
          selected: _attachmentsTab,
          avatar: _attachmentsTab ? null : const Icon(Icons.attach_file),
          label: Text(l10n.mailAttachmentCount(attachments)),
          onSelected: (value) => _updateState(() => _attachmentsTab = value),
        ),
      if (_peopleFailed)
        TextButton.icon(
          key: const ValueKey('mail-people-retry'),
          style: TextButton.styleFrom(
            visualDensity: VisualDensity.compact,
            foregroundColor: tokens.colorScheme.mutedForeground,
            textStyle: muted,
          ),
          onPressed: _peopleLoading ? null : _resolvePeople,
          icon: const Icon(Icons.refresh, size: 16),
          label: Text(l10n.mailProfilesRetry),
        ),
    ];
    if (children.isEmpty) return const SizedBox(height: AppSpacing.xs);
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.sm),
      child: Wrap(
        spacing: AppSpacing.sm,
        runSpacing: AppSpacing.sm,
        crossAxisAlignment: WrapCrossAlignment.center,
        children: children,
      ),
    );
  }

  Widget _attachmentList() {
    final files = _attachments;
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

  /// The open detail with [label] added to its header labels.
  Map<String, dynamic>? _withLabel(Map<String, dynamic> label) {
    final detail = _detail;
    if (detail == null) return null;
    List<Map<String, dynamic>> merged(Object? labels) => [
      ...mailRows(labels).where((row) => row['id'] != label['id']),
      label,
    ];
    if (!widget.thread) return {...detail, 'labels': merged(detail['labels'])};
    final thread = detail['thread'] as Map<String, dynamic>;
    return {
      ...detail,
      'thread': {...thread, 'labels': merged(thread['labels'])},
    };
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
      final row = mailRows(
        (await organization)['labels'],
      ).where((row) => row['id'] == label).firstOrNull;
      if (mounted && generation == _contentGeneration && row != null) {
        _updateState(() => _detail = _withLabel(row));
      }
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
