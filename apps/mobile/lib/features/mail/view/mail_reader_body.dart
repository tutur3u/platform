part of 'mail_reader.dart';

extension _MailReaderBody on _MailReaderState {
  /// The default action as an icon button, for readers without a shell
  /// navbar (split panes and standalone readers).
  Widget? _quickButton() {
    final quick = _quick();
    if (quick == null) return null;
    final ready = !_busy && _detail != null && !_readPending;
    return IconButton(
      key: const ValueKey('mail-reader-quick'),
      tooltip: quick.label,
      onPressed: ready ? () => unawaited(quick.run()) : null,
      icon: Icon(quick.icon),
    );
  }

  /// Standalone readers (outside the shared shell) keep a plain app bar.
  PreferredSizeWidget _fallbackAppBar(String subject) {
    final idle = !_busy && _detail != null;
    return AppBar(
      backgroundColor: AppTokens.of(context).colorScheme.background,
      surfaceTintColor: Colors.transparent,
      title: Text(_navbarTitle(subject)),
      actions: [
        ?_quickButton(),
        IconButton(
          tooltip: MaterialLocalizations.of(context).showMenuTooltip,
          onPressed: idle ? _chooseAction : null,
          icon: const Icon(Icons.more_horiz),
        ),
      ],
    );
  }

  /// The subject as the page's heading, with the labels as small badges
  /// after it and the star beside it. Message count, attachments and a
  /// failed name lookup share one quiet row below.
  Widget _threadHeader(String subject) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final tokens = AppTokens.of(context);
    final muted = theme.textTheme.bodySmall?.copyWith(
      color: tokens.colorScheme.mutedForeground,
    );
    final labels = mailRows(
      _messageStateMetadata?['labels'] ?? widget.summary?['labels'],
    );
    final attachments = _attachments.length;
    final meta = <Widget>[
      if (widget.thread && _messages.length > 1)
        Text(
          l10n.mailThreadMessageCount(_messages.length),
          key: const ValueKey('mail-thread-count'),
          style: muted,
        ),
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
    return Padding(
      key: _headingKey,
      padding: const EdgeInsets.only(bottom: AppSpacing.md),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Wrap(
                  spacing: AppSpacing.sm,
                  runSpacing: AppSpacing.xs,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    Semantics(
                      header: true,
                      child: Text(
                        subject,
                        key: const ValueKey('mail-reader-subject'),
                        style: theme.textTheme.titleLarge?.copyWith(
                          fontSize: 20,
                          height: 1.3,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                    for (final label in labels)
                      if (label['name'] case final String name)
                        AppBadge.outline(child: Text(name)),
                  ],
                ),
              ),
              if (_detail != null)
                IconButton(
                  key: const ValueKey('mail-reader-star'),
                  tooltip: _starred ? l10n.mailUnstar : l10n.mailStar,
                  visualDensity: VisualDensity.compact,
                  isSelected: _starred,
                  onPressed: _busy ? null : _toggleStar,
                  icon: const Icon(Icons.star_border_rounded),
                  selectedIcon: Icon(
                    Icons.star_rounded,
                    color: tokens.colorScheme.warning,
                  ),
                ),
            ],
          ),
          if (meta.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.sm),
            Wrap(
              spacing: AppSpacing.sm,
              runSpacing: AppSpacing.sm,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: meta,
            ),
          ],
        ],
      ),
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
              padding: const EdgeInsets.only(bottom: AppSpacing.md),
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

  /// "to me" when this mailbox received it, else "to Name", plus a count of
  /// the other recipients.
  String _recipientLabel(Map<String, dynamic> message) {
    final l10n = context.l10n;
    final rows = mailRows(
      message['recipients'],
    ).where((row) => const {'to', 'cc', 'bcc'}.contains(row['kind'])).toList();
    if (rows.isEmpty) return l10n.mailMessageDetails;
    final mailbox = widget.fromAddress.trim().toLowerCase();
    String address(Map<String, dynamic> row) =>
        (row['address'] as String? ?? '').trim().toLowerCase();
    final mine =
        mailbox.isNotEmpty && rows.any((row) => address(row) == mailbox);
    final first = rows.firstWhere(
      (row) => row['kind'] == 'to',
      orElse: () => rows.first,
    );
    final base = mine
        ? l10n.mailToMe
        : l10n.mailToRecipient(
            MailReaderIdentity.visibleName(
              first['address'] as String? ?? '',
              first['displayName'] as String?,
              _person(first['address'] as String?),
              l10n.mailMember,
            ),
          );
    return rows.length > 1 ? '$base +${rows.length - 1}' : base;
  }

  /// A folded earlier message shows one line of its text.
  String? _collapsedSnippet(Map<String, dynamic> message) {
    final raw =
        (message['snippet'] as String?) ??
        (message['bodyText'] as String?) ??
        '';
    final snippet = raw
        .substring(0, raw.length.clamp(0, 240))
        .replaceAll(RegExp(r'\s+'), ' ')
        .trim();
    return snippet.isEmpty ? null : snippet;
  }

  /// Reply, Reply all and Forward for one message of the conversation; the
  /// bar's Reply answers the newest.
  Future<void> _messageMenu(Map<String, dynamic> message) async {
    final l10n = context.l10n;
    final value = await showAppActionSheet<String>(
      context: context,
      useRootNavigator: true,
      title: _subjectText,
      actions: [
        AppSheetAction(
          label: l10n.mailReply,
          icon: Icons.reply_outlined,
          value: 'reply',
        ),
        AppSheetAction(
          label: l10n.mailReplyAll,
          icon: Icons.reply_all_outlined,
          value: 'reply_all',
        ),
        AppSheetAction(
          label: l10n.mailForward,
          icon: Icons.forward_outlined,
          value: 'forward',
        ),
      ],
    );
    if (!mounted || value == null) return;
    await _reply(
      message,
      all: value == 'reply_all',
      forward: value == 'forward',
    );
  }

  Widget _messageCard(Map<String, dynamic> message, bool headerControls) {
    final tokens = AppTokens.of(context);
    final id = message['id'] as String;
    final expanded = _messageExpanded(message);
    final last = id == _messages.last['id'];
    final detailsOpen = expanded && _detailsOpen.contains(id);
    final foldable = widget.thread && _messages.length > 1;
    final canReply = widget.canSend && expanded && !_busy;
    return DecoratedBox(
      key: ValueKey('mail-message-$id'),
      decoration: BoxDecoration(
        border: last
            ? null
            : Border(bottom: BorderSide(color: tokens.colorScheme.border)),
      ),
      child: Padding(
        padding: EdgeInsets.only(
          top: AppSpacing.sm,
          bottom: expanded ? AppSpacing.md : AppSpacing.sm,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            MailMessageHeader(
              address: message['fromAddress'] as String? ?? '',
              name: message['fromName'] as String?,
              profile: _person(message['fromAddress'] as String?),
              date: mailMessageDate(message),
              recipients: _recipientLabel(message),
              snippet: expanded ? null : _collapsedSnippet(message) ?? '',
              detailsOpen: detailsOpen,
              onTap: foldable
                  ? () => _updateState(() => _expandedMessages[id] = !expanded)
                  : null,
              onToggleDetails: expanded
                  ? () => _updateState(() {
                      if (!_detailsOpen.remove(id)) _detailsOpen.add(id);
                    })
                  : null,
              onMore: canReply ? () => unawaited(_messageMenu(message)) : null,
            ),
            AnimatedSize(
              duration: const Duration(milliseconds: 180),
              curve: Curves.easeOutCubic,
              alignment: AlignmentDirectional.topStart,
              child: !expanded
                  ? const SizedBox(width: double.infinity)
                  : Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        if (detailsOpen)
                          Container(
                            key: ValueKey('mail-details-$id'),
                            margin: const EdgeInsets.only(top: AppSpacing.sm),
                            padding: const EdgeInsets.fromLTRB(
                              AppSpacing.md,
                              AppSpacing.md,
                              AppSpacing.md,
                              0,
                            ),
                            decoration: BoxDecoration(
                              border: Border.all(
                                color: tokens.colorScheme.border,
                              ),
                              borderRadius: tokens.borderRadiusMd,
                            ),
                            child: MailMessageDetails(
                              message: message,
                              people: _people,
                            ),
                          ),
                        const SizedBox(height: AppSpacing.md),
                        MailMessageContent(
                          key: ValueKey(id),
                          repository: widget.repository,
                          workspaceId: widget.workspaceId,
                          mailboxId: widget.mailboxId,
                          message: message,
                          threadId: _id,
                          showControls: !headerControls,
                          renderedDocuments: widget.renderedDocuments,
                          imagesVisible:
                              headerControls || widget.notificationEntry
                              ? _showImages
                              : null,
                          onImagesChanged: widget.notificationEntry
                              ? (_) => _toggleReaderImages()
                              : null,
                        ),
                      ],
                    ),
            ),
          ],
        ),
      ),
    );
  }
}
