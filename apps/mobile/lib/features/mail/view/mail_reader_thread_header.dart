part of 'mail_reader.dart';

/// Heading width from which the action group sits beside the subject.
const double _mailHeaderInlineActionsMinWidth = 480;

/// The conversation's heading as on web Mail: a large subject, a message
/// count pill with the labels, a muted group of conversation actions, and
/// the Conversation / Attachments tabs when files are attached.
extension _MailReaderThreadHeader on _MailReaderState {
  Widget _threadHeader(String subject) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final tokens = AppTokens.of(context);
    final colors = tokens.colorScheme;
    final muted = theme.textTheme.bodySmall?.copyWith(
      color: colors.mutedForeground,
    );
    final labels = mailRows(
      _messageStateMetadata?['labels'] ?? widget.summary?['labels'],
    );
    final meta = <Widget>[
      if (widget.thread && _messages.isNotEmpty)
        DecoratedBox(
          key: const ValueKey('mail-thread-count'),
          decoration: BoxDecoration(
            color: colors.muted,
            borderRadius: BorderRadius.circular(999),
          ),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 2),
            child: Text(
              l10n.mailThreadMessageCount(_messages.length),
              style: tokens.typography.caption.copyWith(
                color: colors.mutedForeground,
                fontWeight: FontWeight.w500,
                fontFeatures: const [FontFeature.tabularFigures()],
              ),
            ),
          ),
        ),
      for (final label in labels)
        if (label['name'] case final String name)
          AppBadge.outline(child: Text(name)),
      if (_peopleFailed)
        TextButton.icon(
          key: const ValueKey('mail-people-retry'),
          style: TextButton.styleFrom(
            visualDensity: VisualDensity.compact,
            foregroundColor: colors.mutedForeground,
            textStyle: muted,
          ),
          onPressed: _peopleLoading ? null : _resolvePeople,
          icon: const Icon(Icons.refresh, size: 16),
          label: Text(l10n.mailProfilesRetry),
        ),
    ];
    final heading = Column(
      crossAxisAlignment: CrossAxisAlignment.start,
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
    );
    final actions = _detail == null ? null : _headerActions();
    final tabs = _detail != null && _attachments.isNotEmpty;
    return Padding(
      key: _headingKey,
      padding: const EdgeInsets.only(bottom: AppSpacing.md),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          LayoutBuilder(
            builder: (context, constraints) {
              if (actions == null) return heading;
              final inline =
                  constraints.maxWidth >=
                  MediaQuery.textScalerOf(
                    context,
                  ).scale(_mailHeaderInlineActionsMinWidth);
              if (inline) {
                return Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(child: heading),
                    const SizedBox(width: AppSpacing.sm),
                    actions,
                  ],
                );
              }
              return Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  heading,
                  const SizedBox(height: AppSpacing.md),
                  actions,
                ],
              );
            },
          ),
          if (tabs) ...[const SizedBox(height: AppSpacing.md), _readerTabs()],
        ],
      ),
    );
  }

  /// Labels, read state, star, archive and delete in one rounded muted
  /// group; each runs the same mutation as the dock and More sheet. The
  /// command that is already the default action stays only there.
  Widget _headerActions() {
    final l10n = context.l10n;
    final colors = AppTokens.of(context).colorScheme;
    final ready = !_busy && _detail != null;
    final inTrash = widget.sourceFolder == 'trash';
    final quick = _dockPlan().quick;
    final quickRead =
        quick == MailQuickAction.markRead ||
        quick == MailQuickAction.markUnread;
    final quickArchive =
        quick == MailQuickAction.archive || quick == MailQuickAction.restore;
    Widget button({
      required String id,
      required IconData icon,
      required String tooltip,
      required Future<void> Function()? run,
      Color? color,
    }) => AppIconButton(
      key: ValueKey('mail-reader-$id'),
      tooltip: tooltip,
      shape: AppButtonShape.circle,
      size: AppButtonSize.small,
      density: AppButtonDensity.iconDense,
      onPressed: run == null ? null : () => unawaited(run()),
      icon: Icon(icon, color: color),
    );
    return Semantics(
      container: true,
      label: l10n.mailThreadActions,
      child: DecoratedBox(
        key: const ValueKey('mail-reader-actions'),
        decoration: BoxDecoration(
          color: colors.muted.withValues(alpha: 0.6),
          borderRadius: BorderRadius.circular(999),
        ),
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.xs),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            spacing: 2,
            children: [
              button(
                id: 'labels',
                icon: Icons.label_outline,
                tooltip: l10n.mailLabels,
                run: ready ? _readerLabels : null,
              ),
              if (!quickRead)
                button(
                  id: 'read',
                  icon: _mailMessageActionIcon(
                    _unread ? 'mark_read' : 'mark_unread',
                  ),
                  tooltip: _unread ? l10n.mailMarkRead : l10n.mailMarkUnread,
                  run: ready && !_readPending ? _toggleRead : null,
                ),
              button(
                id: 'star',
                icon: _starred ? Icons.star_rounded : Icons.star_border_rounded,
                tooltip: _starred ? l10n.mailUnstar : l10n.mailStar,
                color: _starred ? colors.warning : null,
                run: _busy ? null : _toggleStar,
              ),
              if (!_quarantined && !quickArchive)
                button(
                  id: 'archive',
                  icon: _canRestore
                      ? Icons.inbox_outlined
                      : Icons.archive_outlined,
                  tooltip: _canRestore ? l10n.mailRestore : l10n.mailArchive,
                  run: ready ? _archiveOrRestore : null,
                ),
              if (!_quarantined && !inTrash && quick != MailQuickAction.trash)
                button(
                  id: 'trash',
                  icon: _mailMessageActionIcon('trash'),
                  tooltip: l10n.commonDelete,
                  run: ready ? _trashMessage : null,
                ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _readerTabs() {
    final l10n = context.l10n;
    return Align(
      alignment: AlignmentDirectional.centerStart,
      child: ConstrainedBox(
        key: const ValueKey('mail-reader-tabs'),
        constraints: BoxConstraints(
          maxWidth: MediaQuery.textScalerOf(context).scale(360),
        ),
        child: AppSegmentedControl<bool>(
          segments: [
            AppSegment(value: false, label: l10n.mailConversation),
            AppSegment(
              value: true,
              icon: Icons.attach_file,
              label: l10n.mailAttachmentsTab(_attachments.length),
            ),
          ],
          selected: _attachmentsTab,
          onChanged: (value) => _updateState(() => _attachmentsTab = value),
        ),
      ),
    );
  }

  /// The Attachments tab: one, two or three columns by the pane's width.
  Widget _attachmentGrid() => LayoutBuilder(
    builder: (context, constraints) {
      final files = _attachments;
      if (files.isEmpty) return Text(context.l10n.mailNoAttachments);
      final width = constraints.maxWidth;
      final columns = mailAttachmentGridColumns(width);
      return Column(
        key: ValueKey('mail-attachment-grid-$columns'),
        crossAxisAlignment: CrossAxisAlignment.stretch,
        spacing: AppSpacing.md,
        children: [
          for (var row = 0; row < files.length; row += columns)
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              spacing: AppSpacing.md,
              children: [
                for (var i = row; i < row + columns; i++)
                  Expanded(
                    child: i < files.length
                        ? _attachmentTile(files, i)
                        : const SizedBox.shrink(),
                  ),
              ],
            ),
        ],
      );
    },
  );

  Widget _attachmentTile(
    List<(Map<String, dynamic>, Map<String, dynamic>)> files,
    int i,
  ) => MailAttachmentTile(
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
    onDownload: _busy ? null : () => _download(files[i].$1, files[i].$2),
  );
}

/// Columns of the Attachments tab for a content [width].
int mailAttachmentGridColumns(double width) => width >= 640
    ? 3
    : width >= 400
    ? 2
    : 1;
