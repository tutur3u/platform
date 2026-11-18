part of 'mail_reader.dart';

extension _MailReaderBody on _MailReaderState {
  MailPrimaryAction get _primaryAction {
    final preferred = MailPrimaryActionPreference.instance.value;
    final available = preferred == MailPrimaryAction.reply && !widget.canSend
        ? MailPrimaryAction.archive
        : preferred;
    if ((_quarantined &&
            (available == MailPrimaryAction.archive ||
                available == MailPrimaryAction.trash)) ||
        (widget.sourceFolder == 'trash' &&
            available == MailPrimaryAction.trash)) {
      return widget.canSend
          ? MailPrimaryAction.reply
          : MailPrimaryAction.markUnread;
    }
    return available;
  }

  void _runPrimaryAction() {
    final primary = _primaryAction;
    if (primary == MailPrimaryAction.reply) {
      if (_messages.isNotEmpty) unawaited(_reply(_messages.last));
    } else {
      final action = primary == MailPrimaryAction.archive && _canRestore
          ? 'restore'
          : primary.stateAction!;
      unawaited(_action(action, close: true));
    }
  }

  /// Standalone readers (outside the shared shell) keep a plain app bar.
  PreferredSizeWidget _fallbackAppBar(
    String title,
    Map<String, String> actions,
  ) {
    final idle = !_busy && _detail != null;
    return AppBar(
      backgroundColor: AppTokens.of(context).colorScheme.background,
      surfaceTintColor: Colors.transparent,
      title: Text(title),
      actions: [
        IconButton(
          tooltip: MaterialLocalizations.of(context).showMenuTooltip,
          onPressed: idle ? () => _chooseAction(actions) : null,
          icon: const Icon(Icons.more_horiz),
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

  Widget _recipientSummary(Map<String, dynamic> message) {
    final first = mailRows(
      message['recipients'],
    ).where((row) => row['kind'] == 'to').firstOrNull;
    final address = first?['address'] as String?;
    return MailReaderRecipientLine(
      address: address,
      name: first?['displayName'] as String?,
      profile: _person(address),
      date: mailMessageDate(message),
    );
  }

  Widget _messageCard(Map<String, dynamic> message, bool headerControls) {
    return Card(
      color: Colors.transparent,
      surfaceTintColor: Colors.transparent,
      margin: const EdgeInsets.only(bottom: 6),
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: AppTokens.of(context).borderRadiusMd,
      ),
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
              title: MailReaderSenderRow(
                address: message['fromAddress'] as String? ?? '',
                name: message['fromName'] as String?,
                profile: _person(message['fromAddress'] as String?),
                date: mailMessageDate(message),
              ),
              subtitle: _recipientSummary(message),
              children: [
                MailMessageDetails(message: message, people: _people),
                MailMessageContent(
                  key: ValueKey(message['id']),
                  repository: widget.repository,
                  workspaceId: widget.workspaceId,
                  mailboxId: widget.mailboxId,
                  message: message,
                  threadId: _id,
                  showControls: !headerControls,
                  renderedDocuments: widget.renderedDocuments,
                  imagesVisible: headerControls || widget.notificationEntry
                      ? _showImages
                      : null,
                  onImagesChanged: widget.notificationEntry
                      ? (_) => _toggleReaderImages()
                      : null,
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
