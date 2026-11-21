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

  /// Archive (or Restore) and Trash stay one tap away in readers whose
  /// header owns the commands; everything else lives in More.
  List<Widget> _prominentActions() {
    final l10n = context.l10n;
    final idle = !_busy && _detail != null;
    return [
      if (!_quarantined)
        IconButton(
          tooltip: _canRestore ? l10n.mailRestore : l10n.mailArchive,
          onPressed: idle ? _archiveOrRestore : null,
          icon: Icon(
            _canRestore ? Icons.inbox_outlined : Icons.archive_outlined,
          ),
        ),
      if (widget.sourceFolder != 'trash' && !_quarantined)
        IconButton(
          tooltip: l10n.mailTrash,
          onPressed: idle ? _trashMessage : null,
          icon: Icon(_mailMessageActionIcon('trash')),
        ),
    ];
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
        ..._prominentActions(),
        IconButton(
          tooltip: MaterialLocalizations.of(context).showMenuTooltip,
          onPressed: idle ? () => _chooseAction(actions) : null,
          icon: const Icon(Icons.more_horiz),
        ),
      ],
    );
  }

  /// The opening frame while the body hydrates: the inbox row's sender and
  /// snippet when known, then placeholders in the shape of the message.
  Widget _summaryPreview() {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final tokens = AppTokens.of(context);
    final summary = widget.summary ?? const <String, dynamic>{};
    final sender = widget.thread
        ? mailRows(
            summary['participants'],
          ).map((p) => p['displayName'] ?? p['address']).join(', ')
        : (summary['fromName'] ?? summary['fromAddress']) as String? ?? '';
    final snippet =
        (summary[widget.thread ? 'latestSnippet' : 'snippet'] as String?) ?? '';
    final failed = _loadError != null;
    final known = sender.isNotEmpty || snippet.isNotEmpty;
    return Semantics(
      label: failed ? null : l10n.commonLoading,
      child: Column(
        key: const ValueKey('mail-reader-summary'),
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (failed)
            AppAlert(
              key: const ValueKey('mail-reader-load-error'),
              variant: AppAlertVariant.destructive,
              title: Text(l10n.mailOpenFailed),
              trailing: TextButton.icon(
                onPressed: () => unawaited(_hydrate()),
                icon: const Icon(Icons.refresh),
                label: Text(l10n.commonRetry),
              ),
            ),
          if (known)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: AppSpacing.md),
              child: Column(
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
                    const SizedBox(height: AppSpacing.sm),
                    Text(
                      snippet,
                      style: theme.textTheme.bodyLarge?.copyWith(
                        height: 1.5,
                        color: tokens.colorScheme.mutedForeground,
                      ),
                    ),
                  ],
                ],
              ),
            ),
          if (!failed && known)
            const ExcludeSemantics(child: MailMessageSkeleton(bodyLines: 4))
          else if (!failed)
            const MailThreadSkeleton(),
        ],
      ),
    );
  }

  bool _messageExpanded(Map<String, dynamic> message) =>
      _expandedMessages[message['id']] ??
      (!widget.thread || message['id'] == _messages.last['id']);

  /// The To line with a count of further recipients; it opens the full
  /// delivery details in a sheet.
  Widget _recipientSummary(Map<String, dynamic> message) {
    final recipients = mailRows(
      message['recipients'],
    ).where((row) => const {'to', 'cc', 'bcc'}.contains(row['kind'])).toList();
    final first =
        recipients.where((row) => row['kind'] == 'to').firstOrNull ??
        recipients.firstOrNull;
    final address = first?['address'] as String?;
    return Semantics(
      button: true,
      label: context.l10n.mailMessageDetails,
      child: InkWell(
        key: ValueKey('mail-recipients-${message['id']}'),
        borderRadius: AppTokens.of(context).borderRadiusMd,
        onTap: () => unawaited(_showMessageDetails(message)),
        child: MailReaderRecipientLine(
          address: address,
          name: first?['displayName'] as String?,
          profile: _person(address),
          date: mailMessageDate(message),
          kind: first?['kind'] as String? ?? 'to',
          others: first == null ? 0 : recipients.length - 1,
        ),
      ),
    );
  }

  Future<void> _showMessageDetails(Map<String, dynamic> message) =>
      showAdaptiveSheet<void>(
        context: context,
        useRootNavigator: true,
        builder: (_) => AppDialogScaffold(
          title: context.l10n.mailMessageDetails,
          child: MailMessageDetails(message: message, people: _people),
        ),
      );

  /// Earlier messages collapse to one line: sender, date and snippet.
  Widget? _collapsedPreview(Map<String, dynamic> message) {
    final raw =
        (message['snippet'] as String?) ??
        (message['bodyText'] as String?) ??
        '';
    final snippet = raw
        .substring(0, raw.length.clamp(0, 240))
        .replaceAll(RegExp(r'\s+'), ' ')
        .trim();
    if (snippet.isEmpty) return null;
    return Padding(
      padding: const EdgeInsets.only(top: AppSpacing.xs),
      child: Text(
        snippet,
        key: ValueKey('mail-collapsed-${message['id']}'),
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: Theme.of(context).textTheme.bodyMedium?.copyWith(
          color: AppTokens.of(context).colorScheme.mutedForeground,
        ),
      ),
    );
  }

  Widget _messageCard(Map<String, dynamic> message, bool headerControls) {
    final expanded = _messageExpanded(message);
    final last = message['id'] == _messages.last['id'];
    return DecoratedBox(
      decoration: BoxDecoration(
        border: last
            ? null
            : Border(
                bottom: BorderSide(
                  color: AppTokens.of(context).colorScheme.border,
                ),
              ),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
        child: ExpansionTile(
          key: _threadExpansionKey(message),
          initiallyExpanded: expanded,
          onExpansionChanged: (value) => _updateState(
            () => _expandedMessages[message['id'] as String] = value,
          ),
          tilePadding: EdgeInsets.zero,
          childrenPadding: const EdgeInsets.only(bottom: AppSpacing.md),
          shape: const Border(),
          collapsedShape: const Border(),
          showTrailingIcon: false,
          dense: true,
          title: MailReaderSenderRow(
            address: message['fromAddress'] as String? ?? '',
            name: message['fromName'] as String?,
            profile: _person(message['fromAddress'] as String?),
            date: mailMessageDate(message),
          ),
          subtitle: AnimatedSize(
            duration: const Duration(milliseconds: 180),
            curve: Curves.easeOutCubic,
            alignment: AlignmentDirectional.topStart,
            child: expanded
                ? _recipientSummary(message)
                : _collapsedPreview(message) ?? const SizedBox.shrink(),
          ),
          children: [
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
      ),
    );
  }
}
