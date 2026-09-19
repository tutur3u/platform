import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/mail/data/mail_optimistic.dart';
import 'package:mobile/features/mail/data/mail_repository.dart';
import 'package:mobile/features/mail/view/mail_composer.dart';
import 'package:mobile/features/mail/view/mail_message_tile.dart';
import 'package:mobile/features/mail/view/mail_reader.dart';
import 'package:mobile/features/mail/view/mail_settings_page.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/view/shell_chrome_actions.dart';
import 'package:mobile/features/shell/view/shell_title_override.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/l10n/l10n.dart';

part 'mail_workspace_layout.dart';
part 'mail_workspace_controls.dart';
part 'mail_shell_actions.dart';

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
    if (!(user.email?.toLowerCase().endsWith('@tuturuuu.com') ?? false)) {
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
  bool _hasMore = false;
  bool _failed = false;
  int _page = 1;
  int _generation = 0;
  int _organizationGeneration = 0;
  String? _visibleListKey;
  String? _openingId;
  Timer? _searchDebounce;

  bool get _threads => _folder != 'drafts' && _folder != 'sent';
  Map<String, dynamic> get _mailbox => _mailboxes.firstWhere(
    (box) => box['id'] == _mailboxId,
    orElse: () => <String, dynamic>{},
  );
  bool get _canSend {
    if (_mailbox['status'] != 'active') return false;
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
    unawaited(_bootstrap());
  }

  void _onSearchFocusChanged() => setState(() {});

  @override
  void dispose() {
    _generation++;
    _organizationGeneration++;
    _searchDebounce?.cancel();
    _searchFocus
      ..removeListener(_onSearchFocusChanged)
      ..dispose();
    _search.dispose();
    if (widget.repository == null) _repository.dispose();
    super.dispose();
  }

  Future<void> _bootstrap() async {
    setState(() {
      _loading = true;
      _failed = false;
    });
    try {
      final result = await _repository.bootstrap(widget.workspaceId);
      if (!mounted) return;
      setState(() {
        _mailboxes = mailRows(result['mailboxes']);
        _mailboxId = _mailboxes.firstOrNull?['id'] as String?;
      });
      await _load(forceRefresh: false);
    } on Object {
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
        _labels = [];
        _folders = [];
      }
      if (!more) {
        _visibleListKey = path;
        _selected.clear();
      }
    });
    try {
      if (!more) unawaited(_loadOrganization(box));
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
    } on Object catch (error) {
      if (mounted && generation == _generation) {
        setState(() {
          _failed = true;
          if (error is ApiException &&
              (error.statusCode == 401 || error.statusCode == 403)) {
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
      if (clearedFilter) unawaited(_load());
    } on Object {
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
    setState(() => _mutating = true);
    try {
      await _repository.markFolderRead(
        widget.workspaceId,
        _mailboxId!,
        _folder,
      );
    } on Object {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(context.l10n.commonSomethingWentWrong)),
        );
      }
    } finally {
      if (mounted) await _load();
      if (mounted) setState(() => _mutating = false);
    }
  }

  Future<void> _open(Map<String, dynamic> item) async {
    if (_openingId != null) return;
    setState(() => _openingId = item['id'] as String);
    final box = _mailboxId!;
    final generation = _generation;
    try {
      final detail = await _repository.detail(
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
      await _pushChild(
        MaterialPageRoute(
          builder: (_) => MailReader(
            repository: _repository,
            workspaceId: widget.workspaceId,
            mailboxId: box,
            detail: detail,
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
