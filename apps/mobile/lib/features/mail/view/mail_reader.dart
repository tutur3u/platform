import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/responsive/adaptive_sheet.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/mail/data/mail_preview_store.dart';
import 'package:mobile/features/mail/data/mail_repository.dart';
import 'package:mobile/features/mail/view/mail_appearance_control.dart';
import 'package:mobile/features/mail/view/mail_attachment_preview.dart';
import 'package:mobile/features/mail/view/mail_composer.dart';
import 'package:mobile/features/mail/view/mail_html_document.dart';
import 'package:mobile/features/mail/view/mail_image_preference.dart';
import 'package:mobile/features/mail/view/mail_message_content.dart';
import 'package:mobile/features/mail/view/mail_message_date.dart';
import 'package:mobile/features/mail/view/mail_message_details.dart';
import 'package:mobile/features/mail/view/mail_primary_action_preference.dart';
import 'package:mobile/features/mail/view/mail_rendered_documents.dart';
import 'package:mobile/features/mail/view/mail_swipe_preferences.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/view/shell_chrome_actions.dart';
import 'package:mobile/features/shell/view/shell_mini_nav.dart';
import 'package:mobile/features/shell/view/shell_title_override.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/app_dialog_scaffold.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;
import 'package:share_plus/share_plus.dart';

part 'mail_reader_body.dart';
part 'mail_reader_chrome.dart';
part 'mail_reader_pane_header.dart';

/// Keeps the end of long messages clear of the floating Mail dock and its
/// reader actions, on top of the shell dock clearance.
const double _mailReaderEndGap = 128;

class MailReader extends StatefulWidget {
  const MailReader({
    required this.repository,
    required this.workspaceId,
    required this.mailboxId,
    required this.thread,
    required this.canSend,
    required this.fromAddress,
    this.detail,
    this.summary,
    this.loadDetail,
    this.onClose,
    this.pushRoute,
    this.renderedDocuments,
    this.refreshOnOpen = false,
    this.notificationEntry = false,
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

  /// The full detail when it is already cached; otherwise [summary] (the
  /// inbox row) renders immediately while [loadDetail] hydrates the body.
  final Map<String, dynamic>? detail;
  final Map<String, dynamic>? summary;

  /// Loads the body and reports whether it came from the network. A body
  /// hydrated from the encrypted snapshot is revalidated once.
  final Future<MailPreview> Function()? loadDetail;

  /// The owning Mail view's memo of rendered HTML documents.
  final MailRenderedDocuments? renderedDocuments;

  /// Closes a reader shown in a split layout's detail pane. Pushed readers
  /// pop their route instead.
  final VoidCallback? onClose;

  /// Pushes reader child routes through the owner, so its chrome yields.
  final Future<void> Function(Route<void> route)? pushRoute;
  final bool refreshOnOpen;
  final bool notificationEntry;
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
  bool _accessRevoked = false;
  bool _busy = false;
  bool _showImages = false;
  bool _childRouteOpen = false;
  final Map<String, bool> _expandedMessages = {};
  late Map<String, dynamic>? _detail = widget.detail;
  Object? _loadError;
  bool _starred = false;
  List<Map<String, dynamic>> get _messages => switch (_detail) {
    null => const [],
    final detail when widget.thread => mailRows(detail['messages']),
    final detail => [detail],
  };
  String get _id => switch (_detail) {
    null => widget.summary!['id'] as String,
    final detail when widget.thread =>
      (detail['thread'] as Map<String, dynamic>)['id'] as String,
    final detail => detail['id'] as String,
  };

  ValueKey<String> _threadExpansionKey(Map<String, dynamic> message) {
    final position = message['id'] == _messages.last['id'] ? 'latest' : 'older';
    return ValueKey('mail-thread-message-${message['id']}-$position');
  }

  @override
  void initState() {
    super.initState();
    _showImages =
        !widget.notificationEntry && MailImagePreference.instance.value;
    widget.repository.accessRevoked?.addListener(_onAccessRevoked);
    MailImagePreference.instance.addListener(_imagePreferenceChanged);
    MailPrimaryActionPreference.instance.addListener(_primaryActionChanged);
    unawaited(MailImagePreference.instance.load());
    unawaited(MailPrimaryActionPreference.instance.load());
    if (_detail != null) {
      _detailReady(refresh: widget.refreshOnOpen);
    } else {
      unawaited(_hydrate());
    }
  }

  void _detailReady({required bool refresh}) {
    _starred = _messages.any((m) => m['starred'] == true);
    if (refresh) unawaited(_refresh());
    if (_messages.any((message) => message['unread'] == true)) {
      unawaited(_action('mark_read'));
    }
  }

  Future<void> _hydrate() async {
    final load = widget.loadDetail;
    if (load == null) return;
    if (_loadError != null) setState(() => _loadError = null);
    try {
      final preview = await load();
      if (!mounted) return;
      setState(() => _detail = preview.detail);
      _detailReady(refresh: widget.thread && !preview.fromNetwork);
    } on ApiException catch (error) {
      if (error.statusCode == 401 || error.statusCode == 403) {
        await widget.repository.denyAccess(widget.workspaceId);
        if (mounted) _close();
      } else if (mounted) {
        setState(() => _loadError = error);
      }
    } on Object catch (error) {
      if (mounted) setState(() => _loadError = error);
    }
  }

  void _close() {
    if (widget.onClose case final close?) {
      close();
    } else {
      Navigator.of(context).pop();
    }
  }

  void _imagePreferenceChanged() {
    if (mounted && !widget.notificationEntry) {
      setState(() => _showImages = MailImagePreference.instance.value);
    }
  }

  void _toggleReaderImages() {
    if (widget.notificationEntry) {
      setState(() => _showImages = !_showImages);
    } else {
      unawaited(MailImagePreference.instance.select(enabled: !_showImages));
    }
  }

  void _primaryActionChanged() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    widget.repository.accessRevoked?.removeListener(_onAccessRevoked);
    MailImagePreference.instance.removeListener(_imagePreferenceChanged);
    MailPrimaryActionPreference.instance.removeListener(_primaryActionChanged);
    super.dispose();
  }

  void _onAccessRevoked() {
    if (!mounted ||
        widget.repository.accessRevoked?.value != widget.workspaceId) {
      return;
    }
    setState(() => _accessRevoked = true);
    if (widget.onClose case final close?) {
      close();
    } else {
      unawaited(Navigator.of(context).maybePop());
    }
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
        if (mounted) _close();
      } else if (error.statusCode == 404 && mounted) {
        _close();
      }
    } on Object {
      // Keep the encrypted cached message readable during a network outage.
    }
  }

  Future<void> _action(String action, {bool close = false}) async {
    if (_detail == null || (_busy && action != 'mark_read')) return;
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
      // Hand the dock back to Mail now, before the reader's pop animation.
      _busy = true;
      widget.onOptimisticAction?.call(action, id);
      lookupShellMiniNavCubit(context)?.dismissOwner('mail-reader');
      try {
        context.read<ShellChromeActionsCubit>().dismissOwner('mail-reader');
      } on ProviderNotFoundException {
        // Standalone reader tests and screens need no shared dock handoff.
      }
      _close();
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
        _close();
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
        if (mounted) _close();
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
    final route = MaterialPageRoute<void>(builder: (_) => child);
    try {
      if (widget.pushRoute case final push?) {
        await push(route);
      } else {
        await Navigator.of(context).push<void>(route);
      }
    } finally {
      if (mounted) setState(() => _childRouteOpen = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_accessRevoked) return const SizedBox.shrink();
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
    final subject = switch (_detail) {
      null => widget.summary?['subject'] as String?,
      final detail when widget.thread =>
        (detail['thread'] as Map<String, dynamic>)['subject'] as String?,
      final detail => detail['subject'] as String?,
    };
    // A deep link opens before its subject is known; do not flash "(No
    // subject)" while the body hydrates.
    final title = subject?.isNotEmpty == true
        ? subject!
        : _detail == null
        ? ''
        : l10n.mailNoSubject;
    final pane = AppMasterDetail.inDetailPaneOf(context);
    final sharedShell = lookupShellTitleOverrideCubit(context) != null;
    // A pane header (split layouts) or the shell owns the message controls.
    final headerControls = sharedShell || pane;
    return Stack(
      fit: StackFit.expand,
      children: [
        if (sharedShell && !pane && !_childRouteOpen)
          _readerChrome(title, actions),
        Scaffold(
          backgroundColor: shad.Theme.of(context).colorScheme.background,
          appBar: sharedShell || pane ? null : _fallbackAppBar(title, actions),
          body: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (pane) _paneHeader(title, actions),
              Expanded(
                child: LayoutBuilder(
                  builder: (context, constraints) => ListView(
                    padding: AppPageInsets.of(
                      context,
                      width: constraints.maxWidth,
                      kind: AppPageKind.reading,
                      endGap: _mailReaderEndGap,
                    ),
                    children: _detail == null
                        ? [_summaryPreview()]
                        : [
                            for (final message in _messages)
                              _messageCard(message, headerControls),
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
