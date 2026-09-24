import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/core/responsive/adaptive_sheet.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/mail/data/mail_repository.dart';
import 'package:mobile/features/mail/view/mail_appearance_control.dart';
import 'package:mobile/features/mail/view/mail_attachment_preview.dart';
import 'package:mobile/features/mail/view/mail_composer.dart';
import 'package:mobile/features/mail/view/mail_html_document.dart';
import 'package:mobile/features/mail/view/mail_image_preference.dart';
import 'package:mobile/features/mail/view/mail_message_content.dart';
import 'package:mobile/features/mail/view/mail_message_date.dart';
import 'package:mobile/features/mail/view/mail_primary_action_preference.dart';
import 'package:mobile/features/mail/view/mail_swipe_preferences.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/view/shell_chrome_actions.dart';
import 'package:mobile/features/shell/view/shell_mini_nav.dart';
import 'package:mobile/features/shell/view/shell_title_override.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/app_dialog_scaffold.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;
import 'package:share_plus/share_plus.dart';

part 'mail_reader_chrome.dart';

class MailReader extends StatefulWidget {
  const MailReader({
    required this.repository,
    required this.workspaceId,
    required this.mailboxId,
    required this.detail,
    required this.thread,
    required this.canSend,
    required this.fromAddress,
    this.refreshOnOpen = false,
    this.onReadFailed,
    this.onOptimisticAction,
    this.onActionSettled,
    this.signatureText,
    this.signatureHtml,
    super.key,
  });
  final MailRepository repository;
  final String workspaceId;
  final String mailboxId;
  final String fromAddress;
  final String? signatureText;
  final String? signatureHtml;
  final Map<String, dynamic> detail;
  final bool refreshOnOpen;
  final VoidCallback? onReadFailed;
  final void Function(String action, String id)? onOptimisticAction;
  final void Function({
    required String action,
    required String id,
    required bool success,
  })?
  onActionSettled;
  final bool thread;
  final bool canSend;

  @override
  State<MailReader> createState() => _MailReaderState();
}

class _MailReaderState extends State<MailReader> {
  bool _busy = false;
  bool _showImages = MailImagePreference.instance.value;
  bool _childRouteOpen = false;
  final Map<String, bool> _expandedMessages = {};
  late Map<String, dynamic> _detail = widget.detail;
  late bool _starred;
  List<Map<String, dynamic>> get _messages =>
      widget.thread ? mailRows(_detail['messages']) : [_detail];
  String get _id => widget.thread
      ? (_detail['thread'] as Map<String, dynamic>)['id'] as String
      : _detail['id'] as String;

  ValueKey<String> _threadExpansionKey(Map<String, dynamic> message) {
    final position = message['id'] == _messages.last['id'] ? 'latest' : 'older';
    return ValueKey('mail-thread-message-${message['id']}-$position');
  }

  @override
  void initState() {
    super.initState();
    MailImagePreference.instance.addListener(_imagePreferenceChanged);
    MailPrimaryActionPreference.instance.addListener(_primaryActionChanged);
    unawaited(MailImagePreference.instance.load());
    unawaited(MailPrimaryActionPreference.instance.load());
    _starred = _messages.any((m) => m['starred'] == true);
    if (widget.refreshOnOpen) unawaited(_refresh());
    if (_messages.any((message) => message['unread'] == true)) {
      unawaited(_action('mark_read'));
    }
  }

  void _imagePreferenceChanged() {
    if (mounted) {
      setState(() => _showImages = MailImagePreference.instance.value);
    }
  }

  void _primaryActionChanged() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    MailImagePreference.instance.removeListener(_imagePreferenceChanged);
    MailPrimaryActionPreference.instance.removeListener(_primaryActionChanged);
    super.dispose();
  }

  Future<void> _refresh() async {
    try {
      final detail = await widget.repository.refreshThread(
        widget.workspaceId,
        widget.mailboxId,
        _id,
      );
      if (mounted) {
        final previousLatestId = _messages.lastOrNull?['id'] as String?;
        setState(() {
          _detail = detail;
          _starred = _messages.any((message) => message['starred'] == true);
          final latestId = _messages.lastOrNull?['id'] as String?;
          if (latestId != null && latestId != previousLatestId) {
            if (previousLatestId != null) {
              _expandedMessages[previousLatestId] = false;
            }
            _expandedMessages[latestId] = true;
          }
        });
      }
    } on ApiException catch (error) {
      if (error.statusCode == 401 || error.statusCode == 403) {
        await widget.repository.denyAccess(widget.workspaceId);
        if (mounted) Navigator.of(context).pop();
      } else if (error.statusCode == 404 && mounted) {
        Navigator.of(context).pop();
      }
    } on Object {
      // Keep the encrypted cached message readable during a network outage.
    }
  }

  Future<void> _action(String action, {bool close = false}) async {
    if (_busy && action != 'mark_read') return;
    DateTime? snoozedUntil;
    if (action == 'snooze') {
      snoozedUntil = await chooseMailSnoozeTime(context);
      if (!mounted || snoozedUntil == null) return;
    }
    final previousStarred = _starred;
    final id = _id;
    final optimisticClose =
        close &&
        (action == 'archive' || action == 'trash' || action == 'restore');
    final onActionSettled = widget.onActionSettled;
    if (action != 'mark_read' && !optimisticClose) {
      setState(() {
        _busy = true;
        if (action == 'star' || action == 'unstar') _starred = action == 'star';
      });
    }
    if (optimisticClose) {
      // Keep the active dock action visually stable during the pop animation.
      // Its callback is guarded by _busy until this reader is disposed.
      _busy = true;
      widget.onOptimisticAction?.call(action, id);
      Navigator.of(context).pop();
    }
    try {
      await widget.repository.changeState(
        widget.workspaceId,
        widget.mailboxId,
        id,
        action,
        thread: widget.thread,
        snoozedUntil: snoozedUntil,
      );
      if (optimisticClose) {
        onActionSettled?.call(action: action, id: id, success: true);
      }
      if (!mounted) return;
      if (close && !optimisticClose) {
        Navigator.of(context).pop();
        return;
      }
    } on Object catch (error) {
      if (optimisticClose) {
        onActionSettled?.call(action: action, id: id, success: false);
        return;
      }
      if (action == 'mark_read') widget.onReadFailed?.call();
      if (error is ApiException &&
          (error.statusCode == 401 || error.statusCode == 403)) {
        await widget.repository.denyAccess(widget.workspaceId);
        if (mounted) Navigator.of(context).pop();
        return;
      }
      if (action == 'mark_read') return;
      if (mounted) {
        if (action == 'star' || action == 'unstar') {
          setState(() => _starred = previousStarred);
        }
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(context.l10n.mailActionFailed)));
      }
    } finally {
      if (mounted && action != 'mark_read' && !optimisticClose) {
        setState(() => _busy = false);
      }
    }
  }

  Future<void> _reply(
    Map<String, dynamic> message, {
    bool all = false,
    bool forward = false,
  }) async {
    await _openChild(
      MailComposer(
        repository: widget.repository,
        workspaceId: widget.workspaceId,
        mailboxId: widget.mailboxId,
        fromAddress: widget.fromAddress,
        signatureText: widget.signatureText,
        signatureHtml: widget.signatureHtml,
        reply: message,
        replyAll: all,
        forward: forward,
      ),
    );
  }

  Future<void> _openChild(Widget child) async {
    if (_childRouteOpen) return;
    setState(() => _childRouteOpen = true);
    try {
      await Navigator.of(context)
          .push<void>(MaterialPageRoute(builder: (_) => child));
    } finally {
      if (mounted) setState(() => _childRouteOpen = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final actions = {
      'snooze': l10n.mailSnooze,
      'unsnooze': l10n.mailUnsnooze,
      'mute': l10n.mailMute,
      'unmute': l10n.mailUnmute,
      'archive': l10n.mailArchive,
      'mark_unread': l10n.mailMarkUnread,
      'restore': l10n.mailRestore,
      'trash': l10n.mailTrash,
    };
    final subject = widget.thread
        ? (_detail['thread'] as Map<String, dynamic>)['subject'] as String?
        : _detail['subject'] as String?;
    final sharedShell = lookupShellTitleOverrideCubit(context) != null;
    final preferred = MailPrimaryActionPreference.instance.value;
    final primary = preferred == MailPrimaryAction.reply && !widget.canSend
        ? MailPrimaryAction.archive
        : preferred;
    return Stack(
      fit: StackFit.expand,
      children: [
        if (sharedShell && !_childRouteOpen)
          _readerChrome(subject ?? l10n.mailNoSubject, actions),
        Scaffold(
          backgroundColor: shad.Theme.of(context).colorScheme.background,
          appBar: sharedShell
              ? null
              : AppBar(
                  backgroundColor: shad.Theme.of(context)
                      .colorScheme
                      .background,
                  surfaceTintColor: Colors.transparent,
                  title: Text(subject ?? l10n.mailNoSubject),
                  actions: [
                    IconButton(
                      tooltip: primary.label(context),
                      onPressed: _busy
                          ? null
                          : () {
                              if (primary == MailPrimaryAction.reply) {
                                if (_messages.isNotEmpty) {
                                  unawaited(_reply(_messages.last));
                                }
                              } else {
                                unawaited(
                                  _action(primary.stateAction!, close: true),
                                );
                              }
                            },
                      icon: Icon(primary.icon),
                    ),
                    IconButton(
                      tooltip: _starred ? l10n.mailUnstar : l10n.mailStar,
                      onPressed: _busy
                          ? null
                          : () => _action(_starred ? 'unstar' : 'star'),
                      icon: Icon(_starred ? Icons.star : Icons.star_border),
                    ),
                    PopupMenuButton<String>(
                      enabled: !_busy,
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
                ),
          body: ListView(
            padding: EdgeInsets.only(
              bottom: 16 + MediaQuery.paddingOf(context).bottom,
            ),
            children: [
              for (final message in _messages)
                Card(
                  color: Colors.transparent,
                  surfaceTintColor: Colors.transparent,
                  margin: const EdgeInsets.only(bottom: 6),
                  elevation: 0,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        ExpansionTile(
                          key: _threadExpansionKey(message),
                          initiallyExpanded:
                              _expandedMessages[message['id']] ??
                              (!widget.thread ||
                                  message['id'] == _messages.last['id']),
                          onExpansionChanged: (expanded) =>
                              _expandedMessages[message['id'] as String] =
                                  expanded,
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
                                formatMailMessageDate(
                                  context,
                                  mailMessageDate(message)!,
                                ),
                            ].join(' · '),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                          children: [
                            MailMessageContent(
                              key: ValueKey(message['id']),
                              repository: widget.repository,
                              workspaceId: widget.workspaceId,
                              mailboxId: widget.mailboxId,
                              message: message,
                              showControls: !sharedShell,
                              imagesVisible: sharedShell ? _showImages : null,
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
                                  onPressed: _busy
                                      ? null
                                      : () => _download(message, file),
                                  icon: const Icon(Icons.download_outlined),
                                ),
                              ),
                            if (widget.canSend && !sharedShell)
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
                                    onPressed: () =>
                                        _reply(message, forward: true),
                                    child: Text(l10n.mailForward),
                                  ),
                                ],
                              ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }

  Future<void> _download(
    Map<String, dynamic> message,
    Map<String, dynamic> file,
  ) async {
    setState(() => _busy = true);
    try {
      final bytes = await widget.repository.attachment(
        widget.workspaceId,
        widget.mailboxId,
        message['id'] as String,
        file['id'] as String,
      );
      if (!mounted) return;
      final box = context.findRenderObject()! as RenderBox;
      await SharePlus.instance.share(
        ShareParams(
          files: [
            XFile.fromData(bytes, mimeType: file['contentType'] as String?),
          ],
          fileNameOverrides: [file['filename'] as String],
          sharePositionOrigin: box.localToGlobal(Offset.zero) & box.size,
        ),
      );
    } on Object {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(context.l10n.commonSomethingWentWrong)),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}
