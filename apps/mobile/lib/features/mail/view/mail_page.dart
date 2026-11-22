import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/responsive/adaptive_sheet.dart';
import 'package:mobile/core/responsive/breakpoints.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/startup/foreground_refresh.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/data/repositories/notifications_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/mail/data/mail_access.dart';
import 'package:mobile/features/mail/data/mail_optimistic.dart';
import 'package:mobile/features/mail/data/mail_preview_store.dart';
import 'package:mobile/features/mail/data/mail_push_destination.dart';
import 'package:mobile/features/mail/data/mail_repository.dart';
import 'package:mobile/features/mail/view/mail_appearance_control.dart';
import 'package:mobile/features/mail/view/mail_composer.dart';
import 'package:mobile/features/mail/view/mail_document_request.dart';
import 'package:mobile/features/mail/view/mail_image_preference.dart';
import 'package:mobile/features/mail/view/mail_message_tile.dart';
import 'package:mobile/features/mail/view/mail_quick_filter.dart';
import 'package:mobile/features/mail/view/mail_reader.dart';
import 'package:mobile/features/mail/view/mail_rendered_documents.dart';
import 'package:mobile/features/mail/view/mail_settings_page.dart';
import 'package:mobile/features/mail/view/mail_skeletons.dart';
import 'package:mobile/features/mail/view/mail_swipe_preferences.dart';
import 'package:mobile/features/mail/view/mail_swipe_tile.dart';
import 'package:mobile/features/notifications/push/push_notification_service.dart';
import 'package:mobile/features/settings/view/settings_scoped_page.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/view/shell_chrome_actions.dart';
import 'package:mobile/features/shell/view/shell_mini_nav.dart';
import 'package:mobile/features/shell/view/shell_title_override.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/app_dialog_scaffold.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

part 'mail_workspace_layout.dart';
part 'mail_workspace_controls.dart';
part 'mail_shell_actions.dart';
part 'mail_workspace_bulk.dart';
part 'mail_workspace_cache.dart';
part 'mail_workspace_swipes.dart';
part 'mail_workspace_open.dart';
part 'mail_workspace_open_retry.dart';
part 'mail_workspace_refresh.dart';

class MailPage extends StatelessWidget {
  const MailPage({super.key, this.destination});
  final MailPushDestination? destination;

  @override
  Widget build(BuildContext context) {
    final user = context
        .select<AuthCubit, AuthState>((cubit) => cubit.state)
        .user;
    final wsId = context.select<WorkspaceCubit, String?>(
      (cubit) => cubit.state.currentWorkspace?.id,
    );
    if (user == null) return const SizedBox.shrink();
    if (wsId == null) {
      return const AppLoadingIndicator.page();
    }
    if (!canDiscoverMail(user.email, appMetadata: user.appMetadata)) {
      return Center(child: Text(context.l10n.mailAccessRequired));
    }
    final target = destination?.userId == user.id ? destination : null;
    return _MailNavigator(
      key: ValueKey('${user.id}:$wsId:${target?.notificationId}'),
      workspaceId: wsId,
      destination: target,
    );
  }
}

class _MailNavigator extends StatefulWidget {
  const _MailNavigator({
    required this.workspaceId,
    super.key,
    this.destination,
  });
  final String workspaceId;
  final MailPushDestination? destination;
  @override
  State<_MailNavigator> createState() => _MailNavigatorState();
}

class _MailNavigatorState extends State<_MailNavigator> {
  final _navigator = GlobalKey<NavigatorState>();
  @override
  Widget build(BuildContext context) => MediaQuery.removePadding(
    context: context,
    // The shared shell already reserves the status bar above its app header.
    removeTop: true,
    child: ScaffoldMessenger(
      child: NavigatorPopHandler<Object?>(
        onPopWithResult: (result) {
          unawaited(_navigator.currentState?.maybePop(result));
        },
        child: Navigator(
          key: _navigator,
          onGenerateRoute: (_) => MaterialPageRoute<void>(
            builder: (_) => MailWorkspace(
              workspaceId: widget.workspaceId,
              destination: widget.destination,
            ),
          ),
        ),
      ),
    ),
  );
}

class MailWorkspace extends StatefulWidget {
  const MailWorkspace({
    required this.workspaceId,
    super.key,
    this.repository,
    this.destination,
    this.renderedDocuments,
    this.currentUserId = currentCacheUserId,
  });
  final MailPushDestination? destination;
  final String workspaceId;
  final MailRepository? repository;

  /// The memo of rendered HTML bodies. The view creates and disposes its own
  /// unless one is supplied, which the caller then owns.
  final MailRenderedDocuments? renderedDocuments;

  /// The signed-in account, read again whenever a held write is submitted.
  final String? Function() currentUserId;

  @override
  State<MailWorkspace> createState() => _MailWorkspaceState();
}

class _MailWorkspaceState extends State<MailWorkspace> {
  void _updateState(VoidCallback update) => setState(update);
  bool _childRouteOpen = false;
  bool _pushDestinationHandled = false;
  late final MailPreviewStore _previews = _createPreviewStore();
  late final MailRenderedDocuments _renderedDocuments =
      widget.renderedDocuments ?? MailRenderedDocuments();
  _MailSelection? _selection;

  /// Counts opens, so one that had to wait yields to a later one.
  int _openRequest = 0;
  bool _split = false;
  Route<void>? _readerRoute;
  bool _migratingReader = false;
  final Set<String> _visibleIds = {};

  /// Conversations whose newest body should render once its detail loads.
  final Set<String> _prerenderIds = {};
  Timer? _prefetchDebounce;
  ScaffoldFeatureController<SnackBar, SnackBarClosedReason>? _swipeFeedback;

  void _dismissSwipeFeedback() {
    _swipeFeedback?.close();
    _swipeFeedback = null;
  }

  Future<void> _pushChild(Route<void> route) async {
    _dismissSwipeFeedback();
    setState(() => _childRouteOpen = true);
    // Unregister inbox actions before its route becomes offstage.
    await WidgetsBinding.instance.endOfFrame;
    if (!mounted) return;
    try {
      await Navigator.of(context).push<void>(route);
    } finally {
      if (mounted) {
        setState(() => _childRouteOpen = false);
        // A rotation while a child route covered Mail is applied on return.
        if (route != _readerRoute) _syncSelectionWithLayout();
        _flushPendingFeedback();
      }
    }
  }

  late final MailRepository _repository;
  late final NotificationsRepository _notificationsRepository =
      NotificationsRepository(ownsApiClient: true);
  final _swipePreferences = MailSwipePreferences();
  bool _searchVisible = false;
  final _search = TextEditingController();
  final _searchFocus = FocusNode();
  List<Map<String, dynamic>> _mailboxes = [];
  List<Map<String, dynamic>> _items = [];
  List<Map<String, dynamic>> _labels = [];
  List<Map<String, dynamic>> _folders = [];
  final Set<String> _selected = {};

  /// Swipe writes on their way, by conversation, with their mailbox.
  final Map<String, String> _pendingSwipeIds = {};
  final Map<String, ({String mailbox, String action})> _pendingReaderIds = {};
  final Map<String, ({String mailbox, String action})> _pendingDeferredIds = {};
  final Set<Future<void>> _inFlightDeferredCommits = {};
  _PendingMailFeedback? _pendingFeedback;
  _PendingMailFeedback? _activeFeedback;
  bool _disposing = false;

  /// The account this view was opened by; its writes belong to no other.
  late final String? _accountId;
  String? _currentUserId() => widget.currentUserId();
  String? _labelId;
  String? _folderId;
  MailQuickFilter _quickFilter = MailQuickFilter.all;

  /// The list query: typed search plus the quick filter's operator. Drafts
  /// show no filter bar, so no filter applies there.
  String get _query => mailFilterQuery(
    _search.text,
    _folder == 'drafts' ? MailQuickFilter.all : _quickFilter,
  );
  bool _mutating = false;
  String? _mailboxId;
  String _folder = 'inbox';
  bool _loading = true;
  bool _listResolved = false;
  bool _accessVerified = false;
  bool _cacheRestored = false;
  bool _accessDenied = false;
  bool _hasMore = false;
  bool _failed = false;
  int _page = 1;
  int _generation = 0;
  int _bootstrapGeneration = 0;
  int _organizationGeneration = 0;
  String? _visibleListKey;
  Timer? _searchDebounce;
  Timer? _snoozeRefreshTimer;
  StreamSubscription<PushNotificationEvent>? _mailPushSubscription;
  AppLifecycleListener? _lifecycle;

  bool get _threads => _folder != 'drafts' && _folder != 'sent';
  Map<String, dynamic> get _mailbox => _mailboxes.firstWhere(
    (box) => box['id'] == _mailboxId,
    orElse: () => <String, dynamic>{},
  );
  bool get _canSend {
    if (!_accessVerified || _mailbox['status'] != 'active') return false;
    final group = _mailbox['groupPolicy'] as Map<String, dynamic>?;
    final roles = group == null
        ? ['owner', 'admin', 'sender']
        : group['sendAs'] == 'members'
        ? ['owner', 'admin', 'sender', 'viewer']
        : ['owner', 'admin'];
    return roles.contains(_mailbox['role']);
  }

  @override
  void initState() {
    super.initState();
    _repository = widget.repository ?? MailRepository();
    _accountId = widget.currentUserId();
    _repository.accessRevoked?.addListener(_onCacheAccessRevoked);
    _searchFocus.addListener(_onSearchFocusChanged);
    _mailPushSubscription = PushNotificationService.instance.events.listen((
      event,
    ) {
      if (mounted &&
          event.request.openTarget == 'mail' &&
          event.request.userId == context.read<AuthCubit>().state.user?.id &&
          event.request.mailboxId == _mailboxId) {
        _requestForegroundRefresh();
      }
    });
    _lifecycle = AppLifecycleListener(
      onResume: _requestForegroundRefresh,
      // A suspended app may never reach the end of an Undo window.
      onHide: () => unawaited(_settleDeferredWrites()),
    );
    unawaited(_swipePreferences.load());
    // A pre-render must use the reader's image and appearance choices.
    unawaited(MailImagePreference.instance.load());
    unawaited(MailAppearancePreference.instance.load());
    _snoozeRefreshTimer = Timer.periodic(const Duration(minutes: 1), (_) {
      if (WidgetsBinding.instance.lifecycleState == AppLifecycleState.resumed &&
          ['inbox', 'snoozed'].contains(_folder)) {
        _requestForegroundRefresh();
      }
    });
    unawaited(_bootstrap());
  }

  void _requestForegroundRefresh() {
    ForegroundRefresh.request(this, () {
      if (mounted) _refreshVisibleMailbox();
    });
  }

  void _onCacheAccessRevoked() {
    if (mounted &&
        !_accessDenied &&
        _repository.accessRevoked?.value == widget.workspaceId) {
      unawaited(_denyCachedAccess());
    }
  }

  void _onSearchFocusChanged() => setState(() {});

  @override
  void dispose() {
    _disposing = true;
    _repository.accessRevoked?.removeListener(_onCacheAccessRevoked);
    _flushAllDeferredFeedback();
    _swipeFeedback = null;
    _snoozeRefreshTimer?.cancel();
    _prefetchDebounce?.cancel();
    _previews.dispose();
    if (widget.renderedDocuments == null) _renderedDocuments.dispose();
    _generation++;
    _bootstrapGeneration++;
    _organizationGeneration++;
    _searchDebounce?.cancel();
    unawaited(_mailPushSubscription?.cancel());
    _lifecycle?.dispose();
    _searchFocus
      ..removeListener(_onSearchFocusChanged)
      ..dispose();
    _search.dispose();
    _swipePreferences.dispose();
    if (widget.repository == null) {
      if (_inFlightDeferredCommits.isEmpty) {
        _repository.dispose();
      } else {
        unawaited(
          Future.wait(
            _inFlightDeferredCommits.toList(),
          ).whenComplete(_repository.dispose),
        );
      }
    }
    _notificationsRepository.dispose();
    super.dispose();
  }

  Future<void> _load({bool more = false, bool forceRefresh = true}) async {
    final box = _mailboxId;
    final generation = ++_generation;
    if (box == null) {
      setState(() => _loading = false);
      return;
    }
    final page = more ? _page + 1 : 1;
    final params = Uri(
      queryParameters: {
        'folder': _folder,
        'query': _query,
        'page': '$page',
        'pageSize': '30',
        if (_labelId != null) 'label': _labelId,
        if (_folderId != null) 'folderId': _folderId,
      },
    ).query;
    final path =
        '${MailRepository.mailboxPath(widget.workspaceId, box)}'
        '/${_threads ? 'threads' : 'messages'}?$params';
    final cached = !more
        ? _repository.cachedList(widget.workspaceId, path)
        : null;
    setState(() {
      _loading = true;
      _failed = false;
      if (!more && _visibleListKey != path) {
        _listResolved = cached != null;
        _hasMore = false;
        _items = _overlayReaderActions(
          mailRows(cached?[_threads ? 'threads' : 'messages']),
          box,
        );
        final organization = _repository.cachedList(
          widget.workspaceId,
          '${MailRepository.mailboxPath(widget.workspaceId, box)}/organization',
        );
        _labels = mailRows(organization?['labels']);
        _folders = mailRows(
          organization?['folders'],
        ).where((folder) => folder['kind'] == 'custom').toList();
      }
      if (!more) {
        _visibleListKey = path;
        _selected.clear();
      }
    });
    try {
      if (!more) unawaited(_loadOrganization(box));
      _saveView();
      final result = await _readInboxWithRetry(
        widget.workspaceId,
        box,
        folder: _folder,
        query: _query,
        page: page,
        label: _labelId,
        folderId: _folderId,
        forceRefresh: forceRefresh,
      );
      if (!mounted) return;
      // A response that a later change made stale is still the server's
      // word on new mail, so held writes are checked against it first.
      final kept =
          box == _mailboxId &&
          _keepConversationsWithNewMail(mailRows(result['threads']));
      if (generation != _generation) {
        if (kept) unawaited(_load());
        return;
      }
      final pagination = result['pagination'] as Map<String, dynamic>;
      final items = mailRows(result[_threads ? 'threads' : 'messages']);
      setState(() {
        _items = _overlayReaderActions(
          more ? [..._items, ...items] : items,
          box,
        );
        _listResolved = true;
        _page = page;
        _hasMore =
            pagination['hasMore'] as bool? ??
            page * 30 < (pagination['total'] as int? ?? 0);
      });
      _saveView();
      if (!more) _prefetchVisible();
    } on Object catch (error) {
      if (mounted && generation == _generation) {
        setState(() {
          _failed = true;
          if (error is ApiException &&
              (error.statusCode == 401 || error.statusCode == 403)) {
            unawaited(_denyCachedAccess());
            _items = [];
            _selected.clear();
            _hasMore = false;
          }
        });
      }
    } finally {
      if (mounted && generation == _generation) {
        setState(() => _loading = false);
      }
    }
  }

  Future<void> _loadOrganization(String box) async {
    final generation = ++_organizationGeneration;
    final workspaceId = widget.workspaceId;
    try {
      final organization = await _repository.organization(
        widget.workspaceId,
        box,
      );
      if (!mounted ||
          generation != _organizationGeneration ||
          widget.workspaceId != workspaceId ||
          _mailboxId != box) {
        return;
      }
      var clearedFilter = false;
      setState(() {
        _labels = mailRows(organization['labels']);
        _folders = mailRows(
          organization['folders'],
        ).where((folder) => folder['kind'] == 'custom').toList();
        if (_labelId != null &&
            !_labels.any((label) => label['id'] == _labelId)) {
          _labelId = null;
          clearedFilter = true;
        }
        if (_folderId != null &&
            !_folders.any((folder) => folder['id'] == _folderId)) {
          _folderId = null;
          clearedFilter = true;
        }
      });
      _saveView();
      if (clearedFilter) unawaited(_load());
    } on Object catch (error) {
      if (mounted &&
          generation == _organizationGeneration &&
          error is ApiException &&
          (error.statusCode == 401 || error.statusCode == 403)) {
        await _denyCachedAccess();
      }
      // Folder metadata must not delay or hide a successfully loaded inbox.
    }
  }

  Future<void> _compose([Map<String, dynamic>? draft]) async {
    await _pushChild(
      MaterialPageRoute(
        builder: (_) => MailComposer(
          repository: _repository,
          workspaceId: widget.workspaceId,
          mailboxId: _mailboxId!,
          fromAddress: _mailbox['address'] as String,
          signatureText: _mailbox['signatureText'] as String?,
          signatureHtml: _mailbox['signatureHtml'] as String?,
          draft: draft,
        ),
      ),
    );
    if (mounted) await _load();
  }

  Future<void> _manage() async {
    if (_mailboxId == null) return;
    _dismissSwipeFeedback();
    setState(() => _childRouteOpen = true);
    await WidgetsBinding.instance.endOfFrame;
    if (!mounted) return;
    try {
      await pushScopedSettingsPage(
        context,
        builder: (_, isCurrent) => MailSettingsPage(
          repository: _repository,
          workspaceId: widget.workspaceId,
          mailboxId: _mailboxId!,
          swipePreferences: _swipePreferences,
          canManage: ['owner', 'admin'].contains(_mailbox['role']),
          isScopeCurrent: isCurrent,
        ),
      );
    } finally {
      if (mounted) {
        setState(() => _childRouteOpen = false);
        _flushPendingFeedback();
        await _load();
      }
    }
  }

  // A stable tear-off, so the shell registration only changes with the pane.
  Future<void> _onPaneBack() async => _closeSelection();

  @override
  Widget build(BuildContext context) => _buildWorkspace(context);
}

class _PendingMailFeedback {
  _PendingMailFeedback({
    required this.message,
    required this.box,
    required this.folder,
    required this.listKey,
    required this.id,
    required this.threads,
    this.inverse,
    this.restoreUnread = false,
    this.deferredItem,
    this.deferredIndex,
    this.heldActivity,
    this.commit,
  });

  final String message;
  final String box;
  final String folder;
  final String? listKey;
  final String id;
  final bool threads;
  final String? inverse;
  final bool restoreUnread;
  final Map<String, dynamic>? deferredItem;
  final int? deferredIndex;

  /// The conversation's latest message time when its write was held.
  final Object? heldActivity;
  final Future<void> Function()? commit;
  bool settled = false;
}
