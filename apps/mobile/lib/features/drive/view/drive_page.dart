import 'dart:async';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:mime/mime.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/drive/drive_models.dart';
import 'package:mobile/data/repositories/drive_repository.dart';
import 'package:mobile/data/repositories/workspace_permissions_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/view/shell_chrome_actions.dart';
import 'package:mobile/features/shell/view/shell_mini_nav.dart';
import 'package:mobile/features/shell/view/shell_title_override.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/nova_refresh_indicator.dart';
import 'package:mobile/widgets/pending_sync_frame.dart';
import 'package:share_plus/share_plus.dart';

import 'package:url_launcher/url_launcher.dart';

part 'drive_browser.dart';
part 'drive_actions.dart';
part 'drive_grid.dart';
part 'drive_page_preview.dart';
part 'drive_page_widgets.dart';

class DrivePage extends StatefulWidget {
  const DrivePage({super.key, this.repository, this.permissionsRepository});

  final DriveRepository? repository;
  final WorkspacePermissionsRepository? permissionsRepository;

  @override
  State<DrivePage> createState() => _DrivePageState();
}

class _DrivePageState extends State<DrivePage> {
  static const int _pageSize = 100;

  late final DriveRepository _repository;
  late final WorkspacePermissionsRepository _permissionsRepository;
  late final ScrollController _scrollController;
  final TextEditingController _searchController = TextEditingController();
  Timer? _searchDebounce;

  List<DriveEntry> _entries = const <DriveEntry>[];
  final Set<String> _selectedNames = <String>{};
  bool _isLoading = false;
  bool _isLoadingMore = false;
  bool _canManageDrive = false;
  bool _showGrid = false;
  bool _searching = false;
  bool _previewOpen = false;

  void _update(VoidCallback update) => setState(update);
  String _sortBy = 'name';
  String _sortOrder = 'asc';
  String _path = '';
  String? _error;
  int _offset = 0;
  int _total = 0;
  int _requestToken = 0;

  String? get _wsId =>
      context.read<WorkspaceCubit>().state.currentWorkspace?.id;

  String? get _actorId => context.read<AuthCubit>().state.user?.id;

  bool _isCurrentRequest(int token, String wsId, String? actorId) =>
      mounted && token == _requestToken && _wsId == wsId && _actorId == actorId;

  bool get _hasMore => _offset + _pageSize < _total;

  @override
  void initState() {
    super.initState();
    _scrollController = ScrollController(
      onAttach: (_) => WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _maybeLoadMore();
      }),
    );
    _scrollController.addListener(_maybeLoadMore);
    _repository = widget.repository ?? DriveRepository();
    _permissionsRepository =
        widget.permissionsRepository ?? WorkspacePermissionsRepository();
    unawaited(Future<void>.delayed(Duration.zero, _reload));
  }

  @override
  void dispose() {
    _searchDebounce?.cancel();
    _searchController.dispose();
    _scrollController.dispose();
    if (widget.repository == null) _repository.dispose();
    super.dispose();
  }

  Future<void> _reload({bool append = false}) async {
    final wsId = _wsId;
    if (wsId == null || wsId.isEmpty) return;

    final actorId = _actorId;
    final requestToken = ++_requestToken;
    final nextOffset = append ? _offset + _pageSize : 0;
    final previouslySelected = Set<String>.from(_selectedNames);

    setState(() {
      if (append) {
        _isLoadingMore = true;
      } else {
        _isLoading = true;
        _error = null;
      }
    });

    try {
      final permissionsFuture = _permissionsRepository.getPermissions(
        wsId: wsId,
      );
      final listFuture = _repository.listDirectory(
        wsId,
        path: _path,
        search: _searchController.text,
        limit: _pageSize,
        offset: nextOffset,
        sortBy: _sortBy,
        sortOrder: _sortOrder,
      );

      final results = await Future.wait<dynamic>([
        permissionsFuture,
        listFuture,
      ]);

      if (!_isCurrentRequest(requestToken, wsId, actorId)) return;

      final permissions = results[0] as WorkspacePermissions;
      final listResult = results[1] as DriveListResult;

      setState(() {
        _canManageDrive = permissions.containsPermission('manage_drive');
        _entries = append
            ? <String, DriveEntry>{
                for (final entry in _entries) entry.name: entry,
                for (final entry in listResult.entries) entry.name: entry,
              }.values.toList(growable: false)
            : listResult.entries;
        _offset = listResult.offset;
        _total = listResult.total;
        _error = _canManageDrive ? null : context.l10n.drivePermissionDenied;
        _selectedNames
          ..clear()
          ..addAll(
            previouslySelected.where(
              (name) => _entries.any((entry) => entry.name == name),
            ),
          );
      });
    } on ApiException catch (error) {
      if (!_isCurrentRequest(requestToken, wsId, actorId)) return;
      setState(() {
        if ((error.statusCode == 401 || error.statusCode == 403) &&
            !(error.isVerificationRequired || error.code == 'MFA_REQUIRED')) {
          _entries = const [];
          _selectedNames.clear();
          _canManageDrive = false;
          _total = 0;
        }
        _error = error.message;
      });
    } on Object catch (_) {
      if (!_isCurrentRequest(requestToken, wsId, actorId)) return;
      setState(() {
        _error = context.l10n.commonSomethingWentWrong;
      });
    } finally {
      if (_isCurrentRequest(requestToken, wsId, actorId)) {
        setState(() {
          _isLoading = false;
          _isLoadingMore = false;
        });
        if (_error == null) {
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (mounted) _maybeLoadMore();
          });
        }
      }
    }
  }

  void _maybeLoadMore() {
    if (!_scrollController.hasClients ||
        !_scrollController.position.hasContentDimensions) {
      return;
    }
    if (_scrollController.position.extentAfter < 400) unawaited(_loadMore());
  }

  void _resetScope() {
    _searchDebounce?.cancel();
    _requestToken++;
    setState(() {
      _path = '';
      _entries = const [];
      _selectedNames.clear();
      _searchController.clear();
      _searching = false;
      _canManageDrive = false;
      _offset = 0;
      _total = 0;
      _error = null;
      _isLoading = false;
      _isLoadingMore = false;
    });
    unawaited(_reload());
  }

  void _closeSearch() {
    _searchDebounce?.cancel();
    setState(() {
      _searching = false;
      _searchController.clear();
    });
    unawaited(_reload());
  }

  Future<void> _loadMore() async {
    if (_isLoading || _isLoadingMore || !_hasMore) return;
    await _reload(append: true);
  }

  void _onSearchChanged(String value) {
    _searchDebounce?.cancel();
    _searchDebounce = Timer(const Duration(milliseconds: 300), () {
      unawaited(_reload());
    });
  }

  void _goToRoot() => _navigateTo('');

  void _goUp() {
    final parts = _path.split('/')..removeLast();
    _navigateTo(parts.join('/'));
  }

  void _navigateTo(String path) {
    if (_path == path) return;
    _searchDebounce?.cancel();
    setState(() {
      _path = path;
      _entries = const [];
      _offset = 0;
      _total = 0;
      _selectedNames.clear();
      _searching = false;
      _searchController.clear();
    });
    if (_scrollController.hasClients) _scrollController.jumpTo(0);
    unawaited(_reload());
  }

  Future<void> _shareEntry(DriveEntry entry) async {
    final wsId = _wsId;
    final actorId = _actorId;
    final token = _requestToken;
    if (wsId == null) return;
    try {
      final signedUrl = await _repository.createSignedUrl(
        wsId,
        path: _path.isEmpty ? entry.name : '$_path/${entry.name}',
      );
      if (!mounted || !_isCurrentRequest(token, wsId, actorId)) return;
      await SharePlus.instance.share(ShareParams(text: signedUrl));
    } on ApiException catch (error) {
      if (!mounted || !_isCurrentRequest(token, wsId, actorId)) return;
      _toast(error.message, destructive: true);
    }
  }

  Future<void> _copyEntryPath(DriveEntry entry) async {
    final fullPath = _path.isEmpty ? entry.name : '$_path/${entry.name}';
    await Clipboard.setData(ClipboardData(text: '${_wsId!}/$fullPath'));
    if (!mounted) return;
    _toast(context.l10n.drivePathCopied);
  }

  Future<void> _openExternal(DriveEntry entry) async {
    final wsId = _wsId;
    final actorId = _actorId;
    final token = _requestToken;
    if (wsId == null) return;
    try {
      final signedUrl = await _repository.createSignedUrl(
        wsId,
        path: _path.isEmpty ? entry.name : '$_path/${entry.name}',
      );
      if (!mounted || !_isCurrentRequest(token, wsId, actorId)) return;
      await launchUrl(
        Uri.parse(signedUrl),
        mode: LaunchMode.externalApplication,
      );
    } on ApiException catch (error) {
      if (!mounted || !_isCurrentRequest(token, wsId, actorId)) return;
      _toast(error.message, destructive: true);
    }
  }

  Future<void> _showExportLinks(DriveEntry entry) async {
    final wsId = _wsId;
    final actorId = _actorId;
    final token = _requestToken;
    if (wsId == null) return;
    final folderPath = _path.isEmpty ? entry.name : '$_path/${entry.name}';
    try {
      final data = await _repository.exportLinks(wsId, path: folderPath);
      if (!mounted || !_isCurrentRequest(token, wsId, actorId)) return;
      await showAppSheet<void>(
        context: context,
        size: AppSheetSize.large,
        builder: (context) => AppSheetScaffold(
          title: context.l10n.driveExportLinksTitle,
          description: data.folderPath,
          slivers: [
            SliverList.builder(
              itemCount: data.files.length,
              itemBuilder: (context, index) {
                final file = data.files[index];
                return AppGroupedSlice(
                  position: AppSlicePosition.of(index, data.files.length),
                  dividerInset: AppLayout.rowHorizontalPadding,
                  child: AppGroupedRow(
                    title: Text(file.relativePath),
                    subtitle: Text(
                      file.url,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    trailing: AppIconButton(
                      tooltip: context.l10n.commonMoreOptions,
                      icon: const Icon(LucideIcons.ellipsis),
                      onPressed: () => unawaited(_showLinkActions(file.url)),
                    ),
                  ),
                );
              },
            ),
          ],
        ),
      );
    } on ApiException catch (error) {
      if (!mounted || !_isCurrentRequest(token, wsId, actorId)) return;
      _toast(error.message, destructive: true);
    }
  }

  Future<void> _showLinkActions(String url) async {
    final l10n = context.l10n;
    final action = await showAppActionSheet<String>(
      context: context,
      title: l10n.commonMoreOptions,
      actions: [
        AppSheetAction(
          icon: LucideIcons.copy,
          label: l10n.commonCopy,
          value: 'copy',
        ),
        AppSheetAction(
          icon: LucideIcons.share2,
          label: l10n.commonShare,
          value: 'share',
        ),
        AppSheetAction(
          icon: LucideIcons.externalLink,
          label: l10n.commonOpen,
          value: 'open',
        ),
      ],
    );
    if (!mounted) return;
    switch (action) {
      case 'copy':
        await Clipboard.setData(ClipboardData(text: url));
        if (mounted) _toast(context.l10n.driveLinkCopied);
      case 'share':
        await SharePlus.instance.share(ShareParams(text: url));
      case 'open':
        await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
    }
  }

  void _toast(String message, {bool destructive = false}) {
    showAppToast(
      context,
      message: message,
      variant: destructive
          ? AppAlertVariant.destructive
          : AppAlertVariant.success,
    );
  }

  @override
  Widget build(BuildContext context) => _buildBrowser(context);
}
