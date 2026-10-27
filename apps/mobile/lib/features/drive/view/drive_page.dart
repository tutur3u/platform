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
import 'package:mobile/features/finance/widgets/finance_ui.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/view/shell_chrome_actions.dart';
import 'package:mobile/features/shell/view/shell_mini_nav.dart';
import 'package:mobile/features/shell/view/shell_title_override.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';
import 'package:mobile/widgets/pending_sync_frame.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;
import 'package:share_plus/share_plus.dart';

import 'package:url_launcher/url_launcher.dart';

part 'drive_grid.dart';
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

  Future<void> _showCreateFolderDialog() async {
    final controller = TextEditingController();
    final created = await showAppDialog<bool>(
      context: context,
      builder: (context) => AppDialog(
        title: context.l10n.driveCreateFolder,
        content: TextField(
          controller: controller,
          autofocus: true,
          decoration: InputDecoration(hintText: context.l10n.driveFolderName),
        ),
        actions: [
          AppButton.ghost(
            onPressed: () => Navigator.of(context).pop(false),
            child: Text(context.l10n.commonCancel),
          ),
          AppButton.primary(
            onPressed: () => Navigator.of(context).pop(true),
            child: Text(context.l10n.commonCreate),
          ),
        ],
      ),
    );

    if (created != true) return;

    try {
      await _repository.createFolder(
        _wsId!,
        path: _path,
        name: controller.text,
      );
      if (!mounted) return;
      _toast(context.l10n.driveFolderCreated);
      await _reload();
    } on ApiException catch (error) {
      if (!mounted) return;
      _toast(error.message, destructive: true);
    }
  }

  Future<void> _renameEntry(DriveEntry entry) async {
    final controller = TextEditingController(text: entry.name);
    final renamed = await showAppDialog<bool>(
      context: context,
      builder: (context) => AppDialog(
        title: context.l10n.commonRename,
        content: TextField(
          controller: controller,
          autofocus: true,
          decoration: InputDecoration(hintText: context.l10n.driveRenameHint),
        ),
        actions: [
          AppButton.ghost(
            onPressed: () => Navigator.of(context).pop(false),
            child: Text(context.l10n.commonCancel),
          ),
          AppButton.primary(
            onPressed: () => Navigator.of(context).pop(true),
            child: Text(context.l10n.commonSave),
          ),
        ],
      ),
    );

    if (renamed != true || controller.text.trim().isEmpty) return;

    try {
      await _repository.renameEntry(
        _wsId!,
        path: _path,
        currentName: entry.name,
        newName: controller.text,
        isFolder: entry.isFolder,
      );
      if (!mounted) return;
      _toast(context.l10n.driveRenameSuccess);
      await _reload();
    } on ApiException catch (error) {
      if (!mounted) return;
      _toast(error.message, destructive: true);
    }
  }

  Future<void> _deleteEntries(List<DriveEntry> entries) async {
    if (entries.isEmpty) return;

    final confirmed = await showAppDialog<bool>(
      context: context,
      builder: (context) => AppDialog(
        title: context.l10n.commonDelete,
        content: Text(
          entries.length == 1
              ? context.l10n.driveDeleteSingleConfirm
              : context.l10n.driveDeleteManyConfirm(entries.length),
        ),
        actions: [
          AppButton.ghost(
            onPressed: () => Navigator.of(context).pop(false),
            child: Text(context.l10n.commonCancel),
          ),
          AppButton.primary(
            onPressed: () => Navigator.of(context).pop(true),
            child: Text(context.l10n.commonDelete),
          ),
        ],
      ),
    );

    if (confirmed != true) return;

    try {
      for (final entry in entries) {
        if (entry.isFolder) {
          await _repository.deleteFolder(_wsId!, path: _path, name: entry.name);
        } else {
          final fullPath = _path.isEmpty ? entry.name : '$_path/${entry.name}';
          await _repository.deleteFile(_wsId!, path: fullPath);
        }
      }
      if (!mounted) return;
      setState(_selectedNames.clear);
      _toast(context.l10n.driveDeleteSuccess);
      await _reload();
    } on ApiException catch (error) {
      if (!mounted) return;
      _toast(error.message, destructive: true);
    }
  }

  Future<void> _uploadFiles() async {
    final result = await FilePicker.pickFiles();
    if (result.isEmpty || _wsId == null) return;

    for (final file in result) {
      try {
        final bytes = await file.readAsBytes();
        final mimeType =
            lookupMimeType(file.name, headerBytes: bytes.take(12).toList()) ??
            'application/octet-stream';
        final uploadResult = await _repository.uploadBytes(
          _wsId!,
          directoryPath: _path,
          filename: file.name,
          bytes: bytes,
          contentType: mimeType,
        );
        if (!mounted) return;
        if ((uploadResult.autoExtractMessage ?? '').isNotEmpty) {
          _toast(uploadResult.autoExtractMessage!);
        }
      } on ApiException catch (error) {
        if (!mounted) return;
        _toast('${file.name}: ${error.message}', destructive: true);
      }
    }

    if (!mounted) return;
    await _reload();
  }

  Future<void> _showDriveActionsSheet() async {
    final l10n = context.l10n;
    final action = await showAppActionSheet<String>(
      context: context,
      title: l10n.commonCreate,
      actions: [
        AppSheetAction(
          icon: LucideIcons.folderPlus,
          tone: AppTone.info,
          label: l10n.driveCreateFolder,
          value: 'folder',
        ),
        AppSheetAction(
          icon: LucideIcons.upload,
          tone: AppTone.info,
          label: l10n.driveUploadFiles,
          value: 'upload',
        ),
      ],
    );

    if (!mounted || action == null) return;

    switch (action) {
      case 'folder':
        await _showCreateFolderDialog();
      case 'upload':
        await _uploadFiles();
    }
  }

  Future<void> _showSortSheet() async {
    final l10n = context.l10n;
    final action = await showAppChoiceSheet<String>(
      context: context,
      title: l10n.sortBy,
      selected: switch ((_sortBy, _sortOrder)) {
        ('name', 'asc') => 'name_asc',
        ('name', 'desc') => 'name_desc',
        ('updated_at', 'desc') => 'updated_desc',
        ('size', 'desc') => 'size_desc',
        _ => null,
      },
      choices: [
        AppSheetChoice(value: 'name_asc', label: l10n.driveSortNameAsc),
        AppSheetChoice(value: 'name_desc', label: l10n.driveSortNameDesc),
        AppSheetChoice(value: 'updated_desc', label: l10n.driveSortUpdated),
        AppSheetChoice(value: 'size_desc', label: l10n.driveSortSize),
      ],
    );

    if (!mounted || action == null) return;

    setState(() {
      switch (action) {
        case 'name_asc':
          _sortBy = 'name';
          _sortOrder = 'asc';
        case 'name_desc':
          _sortBy = 'name';
          _sortOrder = 'desc';
        case 'updated_desc':
          _sortBy = 'updated_at';
          _sortOrder = 'desc';
        case 'size_desc':
          _sortBy = 'size';
          _sortOrder = 'desc';
      }
    });
    await _reload();
  }

  void _goToRoot() {
    if (_path.isEmpty) return;
    setState(() {
      _path = '';
      _selectedNames.clear();
    });
    unawaited(_reload());
  }

  void _goUp() {
    if (_path.isEmpty) return;
    final parts = _path.split('/')..removeLast();
    setState(() {
      _path = parts.join('/');
      _selectedNames.clear();
    });
    unawaited(_reload());
  }

  Future<void> _openEntry(DriveEntry entry) async {
    final wsId = _wsId;
    final actorId = _actorId;
    final token = _requestToken;
    if (wsId == null) return;
    if (entry.isFolder) {
      setState(() {
        _path = _path.isEmpty ? entry.name : '$_path/${entry.name}';
        _selectedNames.clear();
      });
      await _reload();
      return;
    }

    try {
      final signedUrl = await _repository.createSignedUrl(
        wsId,
        path: _path.isEmpty ? entry.name : '$_path/${entry.name}',
      );
      if (!mounted || !_isCurrentRequest(token, wsId, actorId)) return;
      await Navigator.of(context).push<void>(
        MaterialPageRoute(
          builder: (_) =>
              _DrivePreviewPage(title: entry.name, signedUrl: signedUrl),
        ),
      );
    } on ApiException catch (error) {
      if (!mounted || !_isCurrentRequest(token, wsId, actorId)) return;
      _toast(error.message, destructive: true);
    }
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
    final toastContext = Navigator.of(context, rootNavigator: true).context;
    if (!toastContext.mounted) return;
    shad.showToast(
      context: toastContext,
      builder: (context, overlay) => shad.SurfaceCard(
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Text(
            message,
            style: TextStyle(color: destructive ? Colors.red : null),
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final hasWorkspace = _wsId != null && _wsId!.isNotEmpty;
    final currentFolderLabel = _path.isEmpty ? null : _path.split('/').last;

    return MultiBlocListener(
      listeners: [
        BlocListener<AuthCubit, AuthState>(
          listenWhen: (previous, current) =>
              previous.user?.id != current.user?.id,
          listener: (context, state) => _resetScope(),
        ),
        BlocListener<WorkspaceCubit, WorkspaceState>(
          listenWhen: (previous, current) =>
              previous.currentWorkspace?.id != current.currentWorkspace?.id,
          listener: (context, state) => _resetScope(),
        ),
      ],
      child: shad.Scaffold(
        child: Stack(
          children: [
            ShellTitleOverride(
              ownerId: 'drive-title',
              locations: const {Routes.drive},
              title: currentFolderLabel ?? context.l10n.driveTitle,
              showLeadingBrand: _path.isEmpty && !_searching,
            ),
            ShellMiniNav(
              ownerId: 'drive-root-nav',
              locations: const {Routes.drive},
              deepLinkBackRoute: Routes.apps,
              items: [
                ShellMiniNavItemSpec(
                  id: 'drive-back',
                  icon: Icons.chevron_left,
                  label: context.l10n.navBack,
                  callbackToken: 'back',
                  onPressed: () => context.go(Routes.apps),
                ),
                ShellMiniNavItemSpec(
                  id: 'drive-home',
                  icon: Icons.folder_copy_outlined,
                  label: context.l10n.driveTitle,
                  callbackToken: _path.isEmpty,
                  selected: _path.isEmpty,
                  enabled: hasWorkspace,
                  onPressed: _goToRoot,
                ),
                if (currentFolderLabel != null)
                  ShellMiniNavItemSpec(
                    id: 'drive-folder',
                    icon: Icons.folder_open_outlined,
                    label: currentFolderLabel,
                    callbackToken: _path,
                    selected: true,
                    enabled: hasWorkspace,
                    onPressed: _goUp,
                  ),
              ],
            ),
            ShellChromeActions(
              ownerId: 'drive-root-actions',
              locations: const {Routes.drive},
              // View precedes Search: phones under 400dp keep only the first
              // dock action in the dock.
              actions: [
                ShellActionSpec(
                  id: 'drive-view',
                  inDock: true,
                  icon: _showGrid ? Icons.view_list : Icons.grid_view_rounded,
                  tooltip: _showGrid
                      ? context.l10n.driveListView
                      : context.l10n.driveGridView,
                  callbackToken: _showGrid,
                  enabled: hasWorkspace,
                  highlighted: _showGrid,
                  onPressed: () {
                    setState(() => _showGrid = !_showGrid);
                  },
                ),
                ShellActionSpec(
                  id: 'drive-sort',
                  inDock: true,
                  icon: Icons.sort_rounded,
                  tooltip: context.l10n.sortBy,
                  callbackToken: '$_sortBy:$_sortOrder',
                  enabled: hasWorkspace,
                  onPressed: _showSortSheet,
                ),
                ShellActionSpec.search(
                  id: 'drive-search',
                  active: _searching,
                  tooltip: context.l10n.driveSearchHint,
                  enabled: hasWorkspace,
                  controller: _searchController,
                  searchHint: context.l10n.driveSearchHint,
                  onSearchChanged: _onSearchChanged,
                  onCloseSearch: _closeSearch,
                  onPressed: () {
                    if (_searching) {
                      _closeSearch();
                    } else {
                      setState(() => _searching = true);
                    }
                  },
                ),
                if (_canManageDrive)
                  ShellActionSpec(
                    id: 'drive-create',
                    icon: Icons.add_rounded,
                    tooltip: context.l10n.commonCreate,
                    callbackToken: hasWorkspace,
                    enabled: hasWorkspace,
                    onPressed: _showDriveActionsSheet,
                  ),
                if (_canManageDrive)
                  ShellActionSpec(
                    id: 'drive-delete-selected',
                    icon: Icons.delete_outline_rounded,
                    tooltip: context.l10n.driveDeleteSelected(
                      _selectedNames.length,
                    ),
                    callbackToken: _selectedNames.length,
                    enabled: hasWorkspace && _selectedNames.isNotEmpty,
                    highlighted: _selectedNames.isNotEmpty,
                    onPressed: () => _deleteEntries(
                      _entries
                          .where((entry) => _selectedNames.contains(entry.name))
                          .toList(growable: false),
                    ),
                  ),
              ],
            ),
            if (_isLoading && _entries.isEmpty)
              const AppPageBody(
                kind: AppPageKind.root,
                child: AppLoadingIndicator.page(),
              )
            else
              NovaRefreshIndicator(
                onRefresh: _reload,
                child: AppPageListView(
                  kind: _showGrid ? AppPageKind.root : AppPageKind.detail,
                  controller: _scrollController,
                  physics: const AlwaysScrollableScrollPhysics(),
                  children: [
                    _DriveToolbar(
                      path: _path,
                      onGoUp: _path.isEmpty ? null : _goUp,
                      selectedCount: _selectedNames.length,
                    ),
                    const SizedBox(height: AppSpacing.lg),
                    if (_error != null) _DriveMessageCard(message: _error!),
                    if (_entries.isEmpty && _error == null)
                      _DriveMessageCard(message: context.l10n.driveEmptyState)
                    else if (_showGrid)
                      _DriveGrid(
                        entries: _entries,
                        workspaceId: _wsId ?? '',
                        directoryPath: _path,
                        selectedNames: _selectedNames,
                        onTap: _openEntry,
                        onToggleSelection: (entry) {
                          setState(() {
                            if (_selectedNames.contains(entry.name)) {
                              _selectedNames.remove(entry.name);
                            } else {
                              _selectedNames.add(entry.name);
                            }
                          });
                        },
                        onRename: _canManageDrive ? _renameEntry : null,
                        onDelete: _canManageDrive
                            ? (entry) => _deleteEntries([entry])
                            : null,
                        onShare: _shareEntry,
                        onCopyPath: _copyEntryPath,
                        onOpenExternal: _openExternal,
                        onExportLinks: _showExportLinks,
                      )
                    else
                      ..._entries.map(
                        (entry) => PendingSyncFrame(
                          workspaceId: _wsId ?? '',
                          feature: 'drive',
                          entityId: _path.isEmpty
                              ? entry.name
                              : '$_path/${entry.name}',
                          child: _DriveListTile(
                            entry: entry,
                            selected: _selectedNames.contains(entry.name),
                            onTap: () => _openEntry(entry),
                            onLongPress: () {
                              setState(() {
                                if (_selectedNames.contains(entry.name)) {
                                  _selectedNames.remove(entry.name);
                                } else {
                                  _selectedNames.add(entry.name);
                                }
                              });
                            },
                            onRename: _canManageDrive
                                ? () => _renameEntry(entry)
                                : null,
                            onDelete: _canManageDrive
                                ? () => _deleteEntries([entry])
                                : null,
                            onShare: entry.isFolder
                                ? null
                                : () => _shareEntry(entry),
                            onCopyPath: () => _copyEntryPath(entry),
                            onOpenExternal: entry.isFolder
                                ? null
                                : () => _openExternal(entry),
                            onExportLinks: entry.isFolder
                                ? () => _showExportLinks(entry)
                                : null,
                          ),
                        ),
                      ),
                    if (_hasMore) ...[
                      const SizedBox(height: 16),
                      Center(
                        child: FilledButton.tonal(
                          onPressed: _isLoadingMore ? null : _loadMore,
                          child: _isLoadingMore
                              ? const SizedBox(
                                  width: 18,
                                  height: 18,
                                  child: NovaLoadingIndicator(size: 20),
                                )
                              : Text(context.l10n.commonLoadMore),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }
}
