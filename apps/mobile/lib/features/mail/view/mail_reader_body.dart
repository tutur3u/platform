part of 'mail_reader.dart';

extension _MailReaderBody on _MailReaderState {
  MailPrimaryAction get _primaryAction {
    final preferred = MailPrimaryActionPreference.instance.value;
    return preferred == MailPrimaryAction.reply && !widget.canSend
        ? MailPrimaryAction.archive
        : preferred;
  }

  void _runPrimaryAction() {
    final primary = _primaryAction;
    if (primary == MailPrimaryAction.reply) {
      if (_messages.isNotEmpty) unawaited(_reply(_messages.last));
    } else {
      unawaited(_action(primary.stateAction!, close: true));
    }
  }

  /// Standalone readers (outside the shared shell) keep a plain app bar.
  PreferredSizeWidget _fallbackAppBar(
    String title,
    Map<String, String> actions,
  ) {
    final l10n = context.l10n;
    final primary = _primaryAction;
    final idle = !_busy && _detail != null;
    return AppBar(
      backgroundColor: shad.Theme.of(context).colorScheme.background,
      surfaceTintColor: Colors.transparent,
      title: Text(title),
      actions: [
        IconButton(
          tooltip: primary.label(context),
          onPressed: idle ? _runPrimaryAction : null,
          icon: Icon(primary.icon),
        ),
        IconButton(
          tooltip: _starred ? l10n.mailUnstar : l10n.mailStar,
          onPressed: idle ? () => _action(_starred ? 'unstar' : 'star') : null,
          icon: Icon(_starred ? Icons.star : Icons.star_border),
        ),
        PopupMenuButton<String>(
          enabled: idle,
          onSelected: (action) => _action(action, close: true),
          itemBuilder: (_) => actions.entries
              .map(
                (a) => PopupMenuItem(
                  value: a.key,
                  child: Row(
                    children: [
                      Icon(_mailMessageActionIcon(a.key)),
                      const SizedBox(width: 12),
                      Text(a.value),
                    ],
                  ),
                ),
              )
              .toList(),
        ),
      ],
    );
  }

  /// The inbox row, shown in the opening frame while the body hydrates.
  Widget _summaryPreview() {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final colors = theme.colorScheme;
    final summary = widget.summary ?? const <String, dynamic>{};
    final sender = widget.thread
        ? mailRows(
            summary['participants'],
          ).map((p) => p['displayName'] ?? p['address']).join(', ')
        : (summary['fromName'] ?? summary['fromAddress']) as String? ?? '';
    final snippet =
        (summary[widget.thread ? 'latestSnippet' : 'snippet'] as String?) ?? '';
    final failed = _loadError != null;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.md),
      child: Column(
        key: const ValueKey('mail-reader-summary'),
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (sender.isNotEmpty)
            Text(
              sender,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: theme.textTheme.titleSmall,
            ),
          if (snippet.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.md),
            Text(
              snippet,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: colors.onSurfaceVariant,
              ),
            ),
          ],
          const SizedBox(height: AppSpacing.lg),
          if (failed)
            Row(
              children: [
                Expanded(
                  child: Text(
                    l10n.mailOpenFailed,
                    style: theme.textTheme.bodyMedium?.copyWith(
                      color: colors.error,
                    ),
                  ),
                ),
                TextButton.icon(
                  onPressed: () => unawaited(_hydrate()),
                  icon: const Icon(Icons.refresh),
                  label: Text(l10n.commonRetry),
                ),
              ],
            )
          else
            Semantics(
              label: l10n.commonLoading,
              child: const LinearProgressIndicator(minHeight: 2),
            ),
        ],
      ),
    );
  }

  Widget _messageCard(Map<String, dynamic> message, bool headerControls) {
    final l10n = context.l10n;
    return Card(
      color: Colors.transparent,
      surfaceTintColor: Colors.transparent,
      margin: const EdgeInsets.only(bottom: 6),
      elevation: 0,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: AppSpacing.md),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            ExpansionTile(
              key: _threadExpansionKey(message),
              initiallyExpanded:
                  _expandedMessages[message['id']] ??
                  (!widget.thread || message['id'] == _messages.last['id']),
              onExpansionChanged: (expanded) =>
                  _expandedMessages[message['id'] as String] = expanded,
              tilePadding: EdgeInsets.zero,
              dense: true,
              title: Text(
                message['fromName'] as String? ??
                    message['fromAddress'] as String,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
              subtitle: Text(
                [
                  if (message['fromName'] != null)
                    message['fromAddress'] as String,
                  ...mailRows(message['recipients'])
                      .where((r) => r['kind'] == 'to')
                      .take(1)
                      .map((r) => r['address'] as String),
                  if (mailMessageDate(message) != null)
                    formatMailMessageDate(context, mailMessageDate(message)!),
                ].join(' · '),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
              children: [
                MailMessageDetails(message: message),
                MailMessageContent(
                  key: ValueKey(message['id']),
                  repository: widget.repository,
                  workspaceId: widget.workspaceId,
                  mailboxId: widget.mailboxId,
                  message: message,
                  threadId: _id,
                  showControls: !headerControls,
                  imagesVisible: headerControls || widget.notificationEntry
                      ? _showImages
                      : null,
                  onImagesChanged: widget.notificationEntry
                      ? (_) => _toggleReaderImages()
                      : null,
                ),
                for (final file in mailRows(message['attachments']))
                  ListTile(
                    leading: const Icon(Icons.attach_file),
                    title: Text(file['filename'] as String),
                    onTap: _busy || !canPreviewMailAttachment(file)
                        ? null
                        : () => _openChild(
                            MailAttachmentPreview(
                              repository: widget.repository,
                              workspaceId: widget.workspaceId,
                              mailboxId: widget.mailboxId,
                              messageId: message['id'] as String,
                              file: file,
                            ),
                          ),
                    trailing: IconButton(
                      tooltip: l10n.mailDownload,
                      onPressed: _busy ? null : () => _download(message, file),
                      icon: const Icon(Icons.download_outlined),
                    ),
                  ),
                if (widget.canSend && !headerControls)
                  Wrap(
                    spacing: 8,
                    children: [
                      TextButton(
                        onPressed: () => _reply(message),
                        child: Text(l10n.mailReply),
                      ),
                      TextButton(
                        onPressed: () => _reply(message, all: true),
                        child: Text(l10n.mailReplyAll),
                      ),
                      TextButton(
                        onPressed: () => _reply(message, forward: true),
                        child: Text(l10n.mailForward),
                      ),
                    ],
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
