import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/responsive/adaptive_sheet.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/mail/data/mail_access.dart';
import 'package:mobile/features/mail/data/mail_optimistic.dart';
import 'package:mobile/features/mail/data/mail_repository.dart';
import 'package:mobile/features/mail/view/mail_composer.dart';
import 'package:mobile/features/mail/view/mail_message_tile.dart';
import 'package:mobile/features/mail/view/mail_reader.dart';
import 'package:mobile/features/mail/view/mail_settings_page.dart';
import 'package:mobile/features/mail/view/mail_swipe_preferences.dart';
import 'package:mobile/features/mail/view/mail_swipe_tile.dart';
import 'package:mobile/features/notifications/push/push_notification_service.dart';
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
part 'mail_workspace_cache.dart';
part 'mail_workspace_swipes.dart';

class MailPage extends StatelessWidget {
  const MailPage({super.key});

  @override
  Widget build(BuildContext context) {
    final user = context
        .select<AuthCubit, AuthState>((cubit) => cubit.state)
        .user;
    final wsId = context.select<WorkspaceCubit, String?>(
      (cubit) => cubit.state.currentWorkspace?.id,
    );
    if (user == null || wsId == null) return const SizedBox.shrink();
    if (!canDiscoverMail(user.email)) {
      return Center(child: Text(context.l10n.mailAccessRequired));
    }
    return _MailNavigator(key: ValueKey('${user.id}:$wsId'), workspaceId: wsId);
  }
}

class _MailNavigator extends StatefulWidget {
  const _MailNavigator({required this.workspaceId, super.key});
  final String workspaceId;
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
    child: NavigatorPopHandler<Object?>(
      onPopWithResult: (result) {
        unawaited(_navigator.currentState?.maybePop(result));
      },
      child: Navigator(
        key: _navigator,
        onGenerateRoute: (_) => MaterialPageRoute<void>(
          builder: (_) => MailWorkspace(workspaceId: widget.workspaceId),
        ),
      ),
    ),
  );
}

class MailWorkspace extends StatefulWidget {
  const MailWorkspace({required this.workspaceId, super.key, this.repository});
  final String workspaceId;
  final MailRepository? repository;

  @override
  State<MailWorkspace> createState() => _MailWorkspaceState();
}

class _MailWorkspaceState extends State<MailWorkspace> {
  void _updateState(VoidCallback update) => setState(update);
  bool _childRouteOpen = false;

  Future<void> _pushChild(Route<void> route) async {
    setState(() => _childRouteOpen = true);
    // Unregister inbox actions before its route becomes offstage.
    await WidgetsBinding.instance.endOfFrame;
    if (!mounted) return;
    try {
      await Navigator.of(context).push<void>(route);
    } finally {
      if (mounted) setState(() => _childRouteOpen = false);
    }
  }

  late final MailRepository _repository;
  final _swipePreferences = MailSwipePreferences();
  bool _searchVisible = false;
  final _search = TextEditingController();
  final _searchFocus = FocusNode();
  List<Map<String, dynamic>> _mailboxes = [];
  List<Map<String, dynamic>> _items = [];
  List<Map<String, dynamic>> _labels = [];
  List<Map<String, dynamic>> _folders = [];
  final Set<String> _selected = {};
  String? _labelId;
  String? _folderId;
  bool _mutating = false;
  String? _mailboxId;
  String _folder = 'inbox';
  bool _loading = true;
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
  String? _openingId;
  Timer? _searchDebounce;
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
    _searchFocus.addListener(_onSearchFocusChanged);
    _mailPushSubscription = PushNotificationService.instance.events.listen((
      event,
    ) {
      if (event.request.openTarget == 'mail' &&
          event.request.wsId == widget.workspaceId) {
        _refreshVisibleMailbox();
      }
    });
    _lifecycle = AppLifecycleListener(onResume: _refreshVisibleMailbox);
    unawaited(_swipePreferences.load());
    unawaited(_bootstrap());
  }

  void _refreshVisibleMailbox() {
    if (mounted &&
        _accessVerified &&
        !_mutating &&
        !_loading &&
        !_childRouteOpen) {
      unawaited(_load());
    }
  }

  void _onSearchFocusChanged() => setState(() {});

  @override
  void dispose() {
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
    if (widget.repository == null) _repository.dispose();
    super.dispose();
  }

  Future<void> _bootstrap() async {
    final generation = ++_bootstrapGeneration;
    setState(() {
      _loading = true;
      _failed = false;
    });
    await _restoreView(generation);
    try {
      final result = await _repository.bootstrap(widget.workspaceId);
      if (!mounted || generation != _bootstrapGeneration) return;
      setState(() {
        _mailboxes = mailRows(result['mailboxes']);
        _accessVerified = true;
        if (!_mailboxes.any((box) => box['id'] == _mailboxId)) {
          _mailboxId = _mailboxes.firstOrNull?['id'] as String?;
          _items = [];
          _labelId = null;
          _folderId = null;
        }
      });
      if (_mailboxes.isEmpty) {
        await _repository.saveView(widget.workspaceId, {
          'mailboxes': <Map<String, dynamic>>[],
          'items': <Map<String, dynamic>>[],
        });
      }
      await _load();
    } on Object catch (error) {
      if (!mounted || generation != _bootstrapGeneration) return;
      if (error is ApiException &&
          (error.statusCode == 401 || error.statusCode == 403)) {
        await _denyCachedAccess();
      }
      if (mounted) {
        setState(() {
          _failed = true;
          _loading = false;
        });
      }
    }
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
        'query': _search.text.trim(),
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
        _hasMore = false;
        _items = mailRows(cached?[_threads ? 'threads' : 'messages']);
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
      final result = await _repository.list(
        widget.workspaceId,
        box,
        folder: _folder,
        query: _search.text.trim(),
        page: page,
        label: _labelId,
        folderId: _folderId,
        forceRefresh: forceRefresh,
      );
      if (!mounted || generation != _generation) return;
      final pagination = result['pagination'] as Map<String, dynamic>;
      setState(() {
        final items = mailRows(result[_threads ? 'threads' : 'messages']);
        _items = more ? [..._items, ...items] : items;
        _page = page;
        _hasMore =
            pagination['hasMore'] as bool? ??
            page * 30 < (pagination['total'] as int? ?? 0);
      });
      _saveView();
      unawaited(_warmVisibleThreads(generation, box));
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
    await _pushChild(
      MaterialPageRoute(
        builder: (_) => MailSettingsPage(
          repository: _repository,
          workspaceId: widget.workspaceId,
          mailboxId: _mailboxId!,
          swipePreferences: _swipePreferences,
          canManage: ['owner', 'admin'].contains(_mailbox['role']),
        ),
      ),
    );
    if (mounted) await _load();
  }

  Future<void> _bulk(String action, {String? labelId, String? folderId}) async {
    final box = _mailboxId;
    if (_mutating || _selected.isEmpty || box == null) return;
    final selected = Set<String>.of(_selected);
    final previous = _items;
    final generation = ++_generation;
    setState(() {
      _mutating = true;
      _loading = false;
      _items = optimisticMailItems(
        _items,
        selected,
        action: action,
        folder: _folder,
        query: _search.text,
      );
      _selected.clear();
    });
    try {
      await _repository.bulk(
        widget.workspaceId,
        box,
        selected.toList(),
        action,
        threads: _threads,
        labelId: labelId,
        folderId: folderId,
      );
    } on Object {
      if (mounted && generation == _generation) {
        setState(() {
          _items = previous;
          _selected.addAll(selected);
        });
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(context.l10n.commonSomethingWentWrong)),
        );
      }
    } finally {
      if (mounted) await _load();
      if (mounted) setState(() => _mutating = false);
    }
  }

  Future<void> _markAllRead() async {
    if (_mutating || _mailboxId == null) return;
    final previous = _items;
    final generation = ++_generation;
    setState(() {
      _mutating = true;
      _loading = false;
      _items = optimisticMailItems(
        _items,
        _items.map((item) => item['id'] as String).toSet(),
        action: 'mark_read',
        folder: _folder,
        query: _search.text,
      );
    });
    try {
      await _repository.markFolderRead(
        widget.workspaceId,
        _mailboxId!,
        _folder,
      );
      _saveView();
    } on Object {
      if (mounted && generation == _generation) {
        setState(() => _items = previous);
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(context.l10n.mailActionFailed)));
      }
    } finally {
      if (mounted && generation == _generation) {
        setState(() => _mutating = false);
        unawaited(_load());
      }
    }
  }

  Future<void> _open(Map<String, dynamic> item) async {
    if (_openingId != null) return;
    setState(() => _openingId = item['id'] as String);
    final box = _mailboxId!;
    final generation = _generation;
    try {
      final cached = _threads && _accessVerified
          ? await _repository.cachedThread(
              widget.workspaceId,
              box,
              item['id'] as String,
            )
          : null;
      final detail =
          cached ??
          await _repository.detail(
            widget.workspaceId,
            box,
            item['id'] as String,
            thread: _threads,
          );
      if (!mounted || generation != _generation) return;
      if (_folder == 'drafts') {
        await _compose(detail);
        return;
      }
      final beforeRead = _items;
      setState(
        () => _items = optimisticMailItems(
          _items,
          {item['id'] as String},
          action: 'mark_read',
          folder: _folder,
          query: _search.text,
        ),
      );
      await _pushChild(
        MaterialPageRoute(
          builder: (_) => MailReader(
            repository: _repository,
            workspaceId: widget.workspaceId,
            mailboxId: box,
            detail: detail,
            refreshOnOpen: cached != null,
            onReadFailed: () {
              if (mounted && generation == _generation && box == _mailboxId) {
                setState(() => _items = beforeRead);
              }
            },
            thread: _threads,
            canSend: _canSend,
            fromAddress: _mailbox['address'] as String,
            signatureText: _mailbox['signatureText'] as String?,
            signatureHtml: _mailbox['signatureHtml'] as String?,
          ),
        ),
      );
      if (mounted && generation == _generation) await _load();
    } on Object {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(context.l10n.commonSomethingWentWrong)),
        );
      }
    } finally {
      if (mounted) setState(() => _openingId = null);
    }
  }

  @override
  Widget build(BuildContext context) => _buildWorkspace(context);
}
