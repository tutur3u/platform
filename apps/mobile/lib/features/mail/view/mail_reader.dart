import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/responsive/adaptive_sheet.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/mail/data/mail_people_resolver.dart';
import 'package:mobile/features/mail/data/mail_preview_store.dart';
import 'package:mobile/features/mail/data/mail_repository.dart';
import 'package:mobile/features/mail/view/mail_appearance_control.dart';
import 'package:mobile/features/mail/view/mail_attachment_preview.dart';
import 'package:mobile/features/mail/view/mail_attachment_tile.dart';
import 'package:mobile/features/mail/view/mail_composer.dart';
import 'package:mobile/features/mail/view/mail_html_document.dart';
import 'package:mobile/features/mail/view/mail_image_preference.dart';
import 'package:mobile/features/mail/view/mail_message_content.dart';
import 'package:mobile/features/mail/view/mail_message_date.dart';
import 'package:mobile/features/mail/view/mail_message_details.dart';
import 'package:mobile/features/mail/view/mail_move_destinations.dart';
import 'package:mobile/features/mail/view/mail_primary_action_preference.dart';
import 'package:mobile/features/mail/view/mail_reader_dock_plan.dart';
import 'package:mobile/features/mail/view/mail_reader_header.dart';
import 'package:mobile/features/mail/view/mail_reader_identity.dart';
import 'package:mobile/features/mail/view/mail_rendered_documents.dart';
import 'package:mobile/features/mail/view/mail_skeletons.dart';
import 'package:mobile/features/mail/view/mail_swipe_preferences.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/view/shell_chrome_actions.dart';
import 'package:mobile/features/shell/view/shell_mini_nav.dart';
import 'package:mobile/features/shell/view/shell_route_transition.dart';
import 'package:mobile/features/shell/view/shell_title_override.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/app_dialog_scaffold.dart';
import 'package:share_plus/share_plus.dart';

part 'mail_reader_actions.dart';
part 'mail_reader_body.dart';
part 'mail_reader_chrome.dart';
part 'mail_reader_loading.dart';
part 'mail_reader_mutations.dart';
part 'mail_reader_pane_header.dart';

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
    this.onDeferCloseAction,
    this.onActionSettled,
    this.signatureText,
    this.signatureHtml,
    this.resolvePeople,
    this.sourceFolder,
    this.folders = const [],
    super.key,
  });
  final MailRepository repository;
  final String workspaceId;
  final String mailboxId;
  final String fromAddress;

  /// Folder context supplies per-user archive/trash state.
  final String? sourceFolder;

  /// The mailbox's own custom folders, already loaded by the owning view. They
  /// are the only extra destinations the Move action lists.
  final List<Map<String, dynamic>> folders;
  final String? signatureText;
  final String? signatureHtml;
  final Future<Map<String, Map<String, dynamic>>> Function(
    String workspaceId,
    List<String> emails,
  )?
  resolvePeople;

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

  /// Returns true when the owner defers committing a closing Inbox action
  /// through its Undo window instead of writing immediately. The owner then
  /// applies the optimistic change itself. `starred`, `unread` and
  /// `lastMessageAt` are the conversation as the reader shows it.
  final bool Function(
    String action,
    String id, {
    required bool starred,
    required bool unread,
    required Object? lastMessageAt,
  })?
  onDeferCloseAction;
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
  late final _peopleResolver = MailPeopleResolver();
  Map<String, Map<String, dynamic>> _people = {};
  bool _peopleFailed = false;
  bool _peopleLoading = false;

  /// A failed lookup retries once quietly before offering a manual retry.
  bool _peopleRetried = false;
  Timer? _peopleRetry;
  int _peopleGeneration = 0;
  bool? _unreadOverride;
  bool? _snoozedOverride;
  bool? _mutedOverride;
  int _contentGeneration = 0;
  bool _attachmentsTab = false;
  bool _accessRevoked = false;

  /// Set once the dock's Back closes the reader, which stays mounted while
  /// its route animates out.
  bool _closing = false;
  bool _busy = false;
  bool _readPending = false;
  bool _showImages = false;
  bool _childRouteOpen = false;
  final Map<String, bool> _expandedMessages = {};

  /// Messages whose delivery details are open under their sender row.
  final Set<String> _detailsOpen = {};
  late Map<String, dynamic>? _detail = widget.detail;
  Object? _loadError;
  bool _starred = false;

  final GlobalKey _headingKey = GlobalKey();
  double _headingExtent = 56;
  double _lastScrollPixels = 0;
  bool _pendingTitleSync = false;

  /// Whether the subject heading has scrolled under the navbar, which then
  /// shows the subject instead of the folder.
  bool _subjectInTitle = false;

  Map<String, dynamic>? _messagesSource;
  List<Map<String, dynamic>> _messagesCache = const [];

  /// Parsed once per detail: rows read it many times per build.
  List<Map<String, dynamic>> get _messages {
    final detail = _detail;
    if (!identical(detail, _messagesSource)) {
      _messagesSource = detail;
      _messagesCache = switch (detail) {
        null => const [],
        _ when widget.thread => mailRows(detail['messages']),
        _ => [detail],
      };
    }
    return _messagesCache;
  }

  String get _id => switch (_detail) {
    null => widget.summary!['id'] as String,
    final detail when widget.thread =>
      (detail['thread'] as Map<String, dynamic>)['id'] as String,
    final detail => detail['id'] as String,
  };

  void _updateState(VoidCallback update) => setState(update);

  /// Follows the reader's own vertical scroll and layout-clamped metric
  /// updates. The list keeps the route's primary scroll controller, so the
  /// status-bar tap still scrolls to top.
  void _updateHeadingExtent() {
    final heading = _headingKey.currentContext?.findRenderObject();
    if (heading is RenderBox && heading.hasSize) {
      _headingExtent = heading.size.height;
    }
  }

  void _syncSubjectInTitle(ScrollMetrics metrics) {
    _lastScrollPixels = metrics.pixels;
    if (SchedulerBinding.instance.schedulerPhase ==
        SchedulerPhase.persistentCallbacks) {
      if (_pendingTitleSync) return;
      _pendingTitleSync = true;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _pendingTitleSync = false;
        if (!mounted) return;
        _updateHeadingExtent();
        final next = _lastScrollPixels > _headingExtent;
        if (next != _subjectInTitle) setState(() => _subjectInTitle = next);
      });
      return;
    }
    _updateHeadingExtent();
    final next = _lastScrollPixels > _headingExtent;
    if (next != _subjectInTitle) setState(() => _subjectInTitle = next);
  }

  bool _onScroll(ScrollNotification notification) {
    if (notification.depth == 0 && notification.metrics.axis == Axis.vertical) {
      _syncSubjectInTitle(notification.metrics);
    }
    return false;
  }

  bool _onScrollMetrics(ScrollMetricsNotification notification) {
    if (notification.depth == 0 && notification.metrics.axis == Axis.vertical) {
      _syncSubjectInTitle(notification.metrics);
    }
    return false;
  }

  @override
  void initState() {
    super.initState();
    _showImages =
        !widget.notificationEntry && MailImagePreference.instance.value;
    widget.repository.accessRevoked?.addListener(_onAccessRevoked);
    MailImagePreference.instance.addListener(_imagePreferenceChanged);
    MailPrimaryActionPreference.instance.addListener(_primaryActionChanged);
    MailAppearancePreference.instance.addListener(_primaryActionChanged);
    unawaited(MailImagePreference.instance.load());
    unawaited(MailPrimaryActionPreference.instance.load());
    if (_detail != null) {
      _detailReady(refresh: widget.refreshOnOpen);
    } else {
      unawaited(_hydrate());
    }
  }

  void _detailReady({required bool refresh}) {
    unawaited(_resolvePeople());
    _starred = _messages.any((m) => m['starred'] == true);
    if (refresh) unawaited(_refresh());
    if (_messages.any((message) => message['unread'] == true)) {
      unawaited(_action('mark_read'));
    }
  }

  @override
  void didUpdateWidget(covariant MailReader oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.workspaceId != widget.workspaceId ||
        oldWidget.mailboxId != widget.mailboxId ||
        oldWidget.repository != widget.repository) {
      _contentGeneration++;
      _peopleGeneration++;
      _people = {};
      _peopleFailed = false;
      _peopleLoading = false;
      _peopleRetried = false;
      _peopleRetry?.cancel();
      _readPending = false;
      _busy = false;
      _attachmentsTab = false;
      _unreadOverride = null;
      _snoozedOverride = null;
      _mutedOverride = null;
      _expandedMessages.clear();
      _detailsOpen.clear();
      _detail = widget.detail;
      _loadError = null;
      oldWidget.repository.accessRevoked?.removeListener(_onAccessRevoked);
      widget.repository.accessRevoked?.addListener(_onAccessRevoked);
      _accessRevoked = false;
      if (_detail != null) {
        _detailReady(refresh: widget.refreshOnOpen);
      } else {
        unawaited(_hydrate());
      }
    }
  }

  void _close() {
    if (widget.onClose case final close?) {
      close();
    } else {
      Navigator.of(context).pop();
    }
  }

  /// The dock's and system Back. Only the current reader closes; a press
  /// while it closes or settles from a swipe must not pop the list beneath.
  Future<void> _closeFromBack() async {
    if (_closing || !(ModalRoute.isCurrentOf(context) ?? false)) return;
    setState(() => _closing = true);
    _close();
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
    MailAppearancePreference.instance.removeListener(_primaryActionChanged);
    _peopleGeneration++;
    _contentGeneration++;
    _peopleRetry?.cancel();
    _peopleResolver.dispose();
    super.dispose();
  }

  void _onAccessRevoked() {
    if (!mounted ||
        widget.repository.accessRevoked?.value != widget.workspaceId) {
      return;
    }
    _peopleGeneration++;
    setState(() {
      _accessRevoked = true;
      _people = {};
    });
    if (widget.onClose case final close?) {
      close();
    } else {
      unawaited(Navigator.of(context).maybePop());
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
    final route = MaterialPageRoute<void>(
      fullscreenDialog: child is MailAttachmentPreview,
      builder: (_) => child,
    );
    try {
      if (child is MailAttachmentPreview) {
        await Navigator.of(context, rootNavigator: true).push<void>(route);
      } else if (widget.pushRoute case final push?) {
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
    // Capture the shell inset before Scaffold adjusts its body's MediaQuery.
    final readerBottomClearance = AppPageInsets.contentBottomClearance(context);

    // A pane header (split layouts) or the shell owns the message controls.
    final headerControls = sharedShell || pane;
    final attachments = _attachmentsTab && _attachments.isNotEmpty;
    final messages = _messages;
    final count = _detail == null
        ? 2
        : attachments
        ? 2
        : 1 + messages.length;
    return Stack(
      fit: StackFit.expand,
      children: [
        if (sharedShell && !pane && !_childRouteOpen) _readerChrome(title),
        Scaffold(
          backgroundColor: sharedShell
              ? Colors.transparent
              : AppTokens.of(context).colorScheme.background,
          appBar: sharedShell || pane ? null : _fallbackAppBar(title),
          body: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (pane) _paneHeader(),
              Expanded(
                child: LayoutBuilder(
                  builder: (context, constraints) =>
                      NotificationListener<ScrollMetricsNotification>(
                        onNotification: _onScrollMetrics,
                        child: NotificationListener<ScrollNotification>(
                          onNotification: _onScroll,
                          child: ListView.builder(
                            padding:
                                AppPageInsets.of(
                                  context,
                                  width: constraints.maxWidth,
                                  kind: AppPageKind.reading,
                                ).copyWith(
                                  top: AppSpacing.sm,
                                  bottom:
                                      readerBottomClearance +
                                      AppLayout.scrollEndGap,
                                ),
                            itemCount: count,
                            itemBuilder: (context, index) {
                              if (index == 0) return _threadHeader(title);
                              if (_detail == null) return _summaryPreview();
                              if (attachments) return _attachmentList();
                              return _messageCard(
                                messages[index - 1],
                                headerControls,
                              );
                            },
                          ),
                        ),
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
