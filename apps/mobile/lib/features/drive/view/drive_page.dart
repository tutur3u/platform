// This screen keeps app-local imports adjacent for scanability.
// ignore_for_file: directives_ordering

import 'dart:async';
import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:mime/mime.dart';
import 'package:mobile/core/responsive/responsive_padding.dart';
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:mobile/core/responsive/responsive_wrapper.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/data/models/drive/drive_models.dart';
import 'package:mobile/data/repositories/drive_repository.dart';
import 'package:mobile/data/repositories/workspace_permissions_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/finance/widgets/finance_ui.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/view/shell_chrome_actions.dart';
import 'package:mobile/features/shell/view/shell_mini_nav.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';
import 'package:share_plus/share_plus.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;
import 'package:url_launcher/url_launcher.dart';

class DrivePage extends StatefulWidget {
  const DrivePage({super.key});

  @override
  State<DrivePage> createState() => _DrivePageState();
}

class _DrivePageState extends State<DrivePage> {
  static const int _pageSize = 100;

  late final DriveRepository _repository;
  late final WorkspacePermissionsRepository _permissionsRepository;
  final TextEditingController _searchController = TextEditingController();
  Timer? _searchDebounce;

  List<DriveEntry> _entries = const <DriveEntry>[];
  final Set<String> _selectedNames = <String>{};
  bool _isLoading = false;
  bool _isLoadingMore = false;
  bool _canManageDrive = false;
  bool _showGrid = false;
  String _sortBy = 'name';
  String _sortOrder = 'asc';
  String _path = '';
  String? _error;
  int _offset = 0;
  int _total = 0;
  int _requestToken = 0;

  String? get _wsId =>
      context.read<WorkspaceCubit>().state.currentWorkspace?.id;

  bool get _hasMore => _entries.length < _total;

  @override
  void initState() {
    super.initState();
    _repository = DriveRepository();
    _permissionsRepository = WorkspacePermissionsRepository();
    unawaited(Future<void>.delayed(Duration.zero, _reload));
  }

  @override
  void dispose() {
    _searchDebounce?.cancel();
    _searchController.dispose();
    _repository.dispose();
    super.dispose();
  }

  Future<void> _reload({bool append = false}) async {
    final wsId = _wsId;
    if (wsId == null || wsId.isEmpty) return;

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

      if (!mounted || requestToken != _requestToken) return;

      final permissions = results[0] as WorkspacePermissions;
      final listResult = results[1] as DriveListResult;

      setState(() {
        _canManageDrive = permissions.containsPermission('manage_drive');
        _entries = append
            ? <DriveEntry>[..._entries, ...listResult.entries]
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
      if (!mounted || requestToken != _requestToken) return;
      setState(() {
        _error = error.message;
      });
    } on Object catch (_) {
      if (!mounted || requestToken != _requestToken) return;
      setState(() {
        _error = context.l10n.commonSomethingWentWrong;
      });
    } finally {
      if (mounted && requestToken == _requestToken) {
        setState(() {
          _isLoading = false;
          _isLoadingMore = false;
        });
      }
    }
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
    final created = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(context.l10n.driveCreateFolder),
        content: TextField(
          controller: controller,
          autofocus: true,
          decoration: InputDecoration(
            hintText: context.l10n.driveFolderName,
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: Text(context.l10n.commonCancel),
          ),
          FilledButton(
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
    final renamed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(context.l10n.commonRename),
        content: TextField(
          controller: controller,
          autofocus: true,
          decoration: InputDecoration(
            hintText: context.l10n.driveRenameHint,
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: Text(context.l10n.commonCancel),
          ),
          FilledButton(
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

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(context.l10n.commonDelete),
        content: Text(
          entries.length == 1
              ? context.l10n.driveDeleteSingleConfirm
              : context.l10n.driveDeleteManyConfirm(entries.length),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: Text(context.l10n.commonCancel),
          ),
          FilledButton(
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
          await _repository.deleteFolder(
            _wsId!,
            path: _path,
            name: entry.name,
          );
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
    final result = await FilePicker.platform.pickFiles(
      allowMultiple: true,
      withData: true,
    );
    if (result == null || result.files.isEmpty || _wsId == null) return;

    for (final file in result.files) {
      try {
        final bytes =
            file.bytes ??
            (file.path == null ? null : await File(file.path!).readAsBytes());
        if (bytes == null) continue;
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
    final action = await showModalBottomSheet<String>(
      context: context,
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.create_new_folder_outlined),
              title: Text(context.l10n.driveCreateFolder),
              onTap: () => Navigator.of(context).pop('folder'),
            ),
            ListTile(
              leading: const Icon(Icons.upload_file_outlined),
              title: Text(context.l10n.driveUploadFiles),
              onTap: () => Navigator.of(context).pop('upload'),
            ),
          ],
        ),
      ),
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
    final action = await showModalBottomSheet<String>(
      context: context,
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: Icon(
                _sortBy == 'name' && _sortOrder == 'asc'
                    ? Icons.check_circle
                    : Icons.sort_by_alpha,
              ),
              title: Text(context.l10n.driveSortNameAsc),
              onTap: () => Navigator.of(context).pop('name_asc'),
            ),
            ListTile(
              leading: Icon(
                _sortBy == 'name' && _sortOrder == 'desc'
                    ? Icons.check_circle
                    : Icons.sort_by_alpha,
              ),
              title: Text(context.l10n.driveSortNameDesc),
              onTap: () => Navigator.of(context).pop('name_desc'),
            ),
            ListTile(
              leading: Icon(
                _sortBy == 'updated_at' && _sortOrder == 'desc'
                    ? Icons.check_circle
                    : Icons.update_rounded,
              ),
              title: Text(context.l10n.driveSortUpdated),
              onTap: () => Navigator.of(context).pop('updated_desc'),
            ),
            ListTile(
              leading: Icon(
                _sortBy == 'size' && _sortOrder == 'desc'
                    ? Icons.check_circle
                    : Icons.data_object_rounded,
              ),
              title: Text(context.l10n.driveSortSize),
              onTap: () => Navigator.of(context).pop('size_desc'),
            ),
          ],
        ),
      ),
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
        _wsId!,
        path: _path.isEmpty ? entry.name : '$_path/${entry.name}',
      );
      if (!mounted) return;
      await Navigator.of(context).push<void>(
        MaterialPageRoute(
          builder: (_) => _DrivePreviewPage(
            title: entry.name,
            signedUrl: signedUrl,
          ),
        ),
      );
    } on ApiException catch (error) {
      if (!mounted) return;
      _toast(error.message, destructive: true);
    }
  }

  Future<void> _shareEntry(DriveEntry entry) async {
    try {
      final signedUrl = await _repository.createSignedUrl(
        _wsId!,
        path: _path.isEmpty ? entry.name : '$_path/${entry.name}',
      );
      await SharePlus.instance.share(ShareParams(text: signedUrl));
    } on ApiException catch (error) {
      if (!mounted) return;
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
    try {
      final signedUrl = await _repository.createSignedUrl(
        _wsId!,
        path: _path.isEmpty ? entry.name : '$_path/${entry.name}',
      );
      await launchUrl(
        Uri.parse(signedUrl),
        mode: LaunchMode.externalApplication,
      );
    } on ApiException catch (error) {
      if (!mounted) return;
      _toast(error.message, destructive: true);
    }
  }

  Future<void> _showExportLinks(DriveEntry entry) async {
    final folderPath = _path.isEmpty ? entry.name : '$_path/${entry.name}';
    try {
      final data = await _repository.exportLinks(_wsId!, path: folderPath);
      if (!mounted) return;
      await showModalBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        builder: (context) => FractionallySizedBox(
          heightFactor: 0.85,
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  context.l10n.driveExportLinksTitle,
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                const SizedBox(height: 8),
                Text(
                  data.folderPath,
                  style: Theme.of(context).textTheme.bodySmall,
                ),
                const SizedBox(height: 16),
                Expanded(
                  child: ListView.builder(
                    itemCount: data.files.length,
                    itemBuilder: (context, index) {
                      final file = data.files[index];
                      return ListTile(
                        contentPadding: EdgeInsets.zero,
                        title: Text(file.relativePath),
                        subtitle: Text(file.url),
                        trailing: PopupMenuButton<String>(
                          onSelected: (value) async {
                            if (value == 'copy') {
                              await Clipboard.setData(
                                ClipboardData(text: file.url),
                              );
                              if (!context.mounted) return;
                              _toast(context.l10n.driveLinkCopied);
                            } else if (value == 'share') {
                              await SharePlus.instance.share(
                                ShareParams(text: file.url),
                              );
                            } else if (value == 'open') {
                              await launchUrl(
                                Uri.parse(file.url),
                                mode: LaunchMode.externalApplication,
                              );
                            }
                          },
                          itemBuilder: (context) => [
                            PopupMenuItem(
                              value: 'copy',
                              child: Text(context.l10n.commonCopy),
                            ),
                            PopupMenuItem(
                              value: 'share',
                              child: Text(context.l10n.commonShare),
                            ),
                            PopupMenuItem(
                              value: 'open',
                              child: Text(context.l10n.commonOpen),
                            ),
                          ],
                        ),
                      );
                    },
                  ),
                ),
              ],
            ),
          ),
        ),
      );
    } on ApiException catch (error) {
      if (!mounted) return;
      _toast(error.message, destructive: true);
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
            style: TextStyle(
              color: destructive ? Colors.red : null,
            ),
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final hasWorkspace = _wsId != null && _wsId!.isNotEmpty;
    final currentFolderLabel = _path.isEmpty ? null : _path.split('/').last;

    return BlocListener<WorkspaceCubit, WorkspaceState>(
      listenWhen: (previous, current) =>
          previous.currentWorkspace?.id != current.currentWorkspace?.id,
      listener: (context, state) {
        setState(() {
          _path = '';
          _entries = const <DriveEntry>[];
          _selectedNames.clear();
        });
        unawaited(_reload());
      },
      child: shad.Scaffold(
        child: Stack(
          children: [
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
              actions: [
                ShellActionSpec(
                  id: 'drive-view',
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
                  icon: Icons.sort_rounded,
                  tooltip: context.l10n.sortBy,
                  callbackToken: '$_sortBy:$_sortOrder',
                  enabled: hasWorkspace,
                  onPressed: _showSortSheet,
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
                          .where(
                            (entry) => _selectedNames.contains(entry.name),
                          )
                          .toList(growable: false),
                    ),
                  ),
              ],
            ),
            ResponsiveWrapper(
              maxWidth: ResponsivePadding.maxContentWidth(context.deviceClass),
              child: _isLoading && _entries.isEmpty
                  ? const Center(child: NovaLoadingIndicator())
                  : RefreshIndicator(
                      onRefresh: _reload,
                      child: ListView(
                        padding: EdgeInsets.fromLTRB(
                          16,
                          8,
                          16,
                          40 + MediaQuery.paddingOf(context).bottom,
                        ),
                        children: [
                          FinanceSectionHeader(
                            title:
                                currentFolderLabel ?? context.l10n.driveTitle,
                            subtitle: _path.isEmpty ? null : _path,
                          ),
                          const SizedBox(height: 12),
                          _DriveToolbar(
                            path: _path,
                            searchController: _searchController,
                            onSearchChanged: _onSearchChanged,
                            onGoUp: _path.isEmpty ? null : _goUp,
                            selectedCount: _selectedNames.length,
                          ),
                          const SizedBox(height: 16),
                          if (_error != null)
                            _DriveMessageCard(message: _error!)
                          else if (_entries.isEmpty)
                            _DriveMessageCard(
                              message: context.l10n.driveEmptyState,
                            )
                          else if (_showGrid)
                            _DriveGrid(
                              entries: _entries,
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
                              (entry) => _DriveListTile(
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
                          if (_hasMore) ...[
                            const SizedBox(height: 16),
                            Center(
                              child: FilledButton.tonal(
                                onPressed: _isLoadingMore ? null : _loadMore,
                                child: _isLoadingMore
                                    ? const SizedBox(
                                        width: 18,
                                        height: 18,
                                        child: CircularProgressIndicator(
                                          strokeWidth: 2,
                                        ),
                                      )
                                    : Text(context.l10n.commonLoadMore),
                              ),
                            ),
                          ],
                        ],
                      ),
                    ),
            ),
          ],
        ),
      ),
    );
  }
}

class _DriveToolbar extends StatelessWidget {
  const _DriveToolbar({
    required this.path,
    required this.searchController,
    required this.onSearchChanged,
    required this.onGoUp,
    required this.selectedCount,
  });

  final String path;
  final TextEditingController searchController;
  final ValueChanged<String> onSearchChanged;
  final VoidCallback? onGoUp;
  final int selectedCount;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    const accent = Color(0xFF3FA36A);

    return FinancePanel(
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          TextField(
            controller: searchController,
            onChanged: onSearchChanged,
            decoration: InputDecoration(
              prefixIcon: const Icon(Icons.search),
              hintText: l10n.driveSearchHint,
            ),
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _MetricChip(
                label: l10n.driveRootLabel,
                value: path.isEmpty ? l10n.driveRootLabel : path,
                icon: Icons.folder_outlined,
                tint: accent,
              ),
              if (selectedCount > 0)
                _MetricChip(
                  label: l10n.driveDeleteSelected(selectedCount),
                  value: '$selectedCount',
                  icon: Icons.check_circle_outline_rounded,
                  tint: accent,
                ),
              if (onGoUp != null)
                OutlinedButton.icon(
                  onPressed: onGoUp,
                  icon: const Icon(Icons.arrow_upward),
                  label: Text(l10n.driveGoUp),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class _DriveListTile extends StatelessWidget {
  const _DriveListTile({
    required this.entry,
    required this.selected,
    required this.onTap,
    required this.onLongPress,
    this.onRename,
    this.onDelete,
    this.onShare,
    this.onCopyPath,
    this.onOpenExternal,
    this.onExportLinks,
  });

  final DriveEntry entry;
  final bool selected;
  final VoidCallback onTap;
  final VoidCallback onLongPress;
  final VoidCallback? onRename;
  final VoidCallback? onDelete;
  final VoidCallback? onShare;
  final VoidCallback? onCopyPath;
  final VoidCallback? onOpenExternal;
  final VoidCallback? onExportLinks;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    const accent = Color(0xFF3FA36A);

    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: GestureDetector(
        onLongPress: onLongPress,
        child: FinancePanel(
          onTap: onTap,
          padding: const EdgeInsets.all(14),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: accent.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Icon(
                  entry.isFolder
                      ? Icons.folder_outlined
                      : Icons.insert_drive_file_outlined,
                  color: accent,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      entry.name,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: theme.typography.large.copyWith(
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      entry.isFolder
                          ? context.l10n.driveFolderLabel
                          : '${_formatBytes(entry.size)}'
                                ' • '
                                '${_formatDate(entry.updatedAt)}',
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: theme.typography.textSmall.copyWith(
                        color: theme.colorScheme.mutedForeground,
                      ),
                    ),
                  ],
                ),
              ),
              Column(
                children: [
                  Checkbox(
                    value: selected,
                    onChanged: (_) => onLongPress(),
                  ),
                  PopupMenuButton<String>(
                    onSelected: (value) {
                      if (value == 'rename') {
                        onRename?.call();
                      } else if (value == 'delete') {
                        onDelete?.call();
                      } else if (value == 'share') {
                        onShare?.call();
                      } else if (value == 'copy') {
                        onCopyPath?.call();
                      } else if (value == 'open') {
                        onOpenExternal?.call();
                      } else if (value == 'export') {
                        onExportLinks?.call();
                      }
                    },
                    itemBuilder: (context) => [
                      if (onRename != null)
                        PopupMenuItem(
                          value: 'rename',
                          child: Text(context.l10n.commonRename),
                        ),
                      if (onCopyPath != null)
                        PopupMenuItem(
                          value: 'copy',
                          child: Text(context.l10n.driveCopyPath),
                        ),
                      if (onShare != null)
                        PopupMenuItem(
                          value: 'share',
                          child: Text(context.l10n.commonShare),
                        ),
                      if (onOpenExternal != null)
                        PopupMenuItem(
                          value: 'open',
                          child: Text(context.l10n.commonOpen),
                        ),
                      if (onExportLinks != null)
                        PopupMenuItem(
                          value: 'export',
                          child: Text(context.l10n.driveExportLinksTitle),
                        ),
                      if (onDelete != null)
                        PopupMenuItem(
                          value: 'delete',
                          child: Text(context.l10n.commonDelete),
                        ),
                    ],
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _DriveGrid extends StatelessWidget {
  const _DriveGrid({
    required this.entries,
    required this.selectedNames,
    required this.onTap,
    required this.onToggleSelection,
    this.onRename,
    this.onDelete,
    this.onShare,
    this.onCopyPath,
    this.onOpenExternal,
    this.onExportLinks,
  });

  final List<DriveEntry> entries;
  final Set<String> selectedNames;
  final ValueChanged<DriveEntry> onTap;
  final ValueChanged<DriveEntry> onToggleSelection;
  final ValueChanged<DriveEntry>? onRename;
  final ValueChanged<DriveEntry>? onDelete;
  final ValueChanged<DriveEntry>? onShare;
  final ValueChanged<DriveEntry>? onCopyPath;
  final ValueChanged<DriveEntry>? onOpenExternal;
  final ValueChanged<DriveEntry>? onExportLinks;

  @override
  Widget build(BuildContext context) {
    return GridView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      itemCount: entries.length,
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 2,
        crossAxisSpacing: 12,
        mainAxisSpacing: 12,
        childAspectRatio: 1.1,
      ),
      itemBuilder: (context, index) {
        final entry = entries[index];
        final selected = selectedNames.contains(entry.name);
        final theme = shad.Theme.of(context);
        const accent = Color(0xFF3FA36A);

        return GestureDetector(
          onLongPress: () => onToggleSelection(entry),
          child: FinancePanel(
            onTap: () => onTap(entry),
            padding: const EdgeInsets.all(12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      width: 36,
                      height: 36,
                      decoration: BoxDecoration(
                        color: accent.withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Icon(
                        entry.isFolder
                            ? Icons.folder_outlined
                            : Icons.insert_drive_file_outlined,
                        color: accent,
                      ),
                    ),
                    const Spacer(),
                    Checkbox(
                      value: selected,
                      onChanged: (_) => onToggleSelection(entry),
                    ),
                  ],
                ),
                const Spacer(),
                Text(
                  entry.name,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: theme.typography.large.copyWith(
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  entry.isFolder
                      ? context.l10n.driveFolderLabel
                      : _formatBytes(entry.size),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: theme.typography.textSmall.copyWith(
                    color: theme.colorScheme.mutedForeground,
                  ),
                ),
                Align(
                  alignment: Alignment.bottomRight,
                  child: PopupMenuButton<String>(
                    onSelected: (value) {
                      if (value == 'rename') {
                        onRename?.call(entry);
                      } else if (value == 'delete') {
                        onDelete?.call(entry);
                      } else if (value == 'share') {
                        onShare?.call(entry);
                      } else if (value == 'copy') {
                        onCopyPath?.call(entry);
                      } else if (value == 'open') {
                        onOpenExternal?.call(entry);
                      } else if (value == 'export') {
                        onExportLinks?.call(entry);
                      }
                    },
                    itemBuilder: (context) => [
                      if (onRename != null)
                        PopupMenuItem(
                          value: 'rename',
                          child: Text(context.l10n.commonRename),
                        ),
                      if (onCopyPath != null)
                        PopupMenuItem(
                          value: 'copy',
                          child: Text(context.l10n.driveCopyPath),
                        ),
                      if (onShare != null)
                        PopupMenuItem(
                          value: 'share',
                          child: Text(context.l10n.commonShare),
                        ),
                      if (onOpenExternal != null)
                        PopupMenuItem(
                          value: 'open',
                          child: Text(context.l10n.commonOpen),
                        ),
                      if (onExportLinks != null)
                        PopupMenuItem(
                          value: 'export',
                          child: Text(context.l10n.driveExportLinksTitle),
                        ),
                      if (onDelete != null)
                        PopupMenuItem(
                          value: 'delete',
                          child: Text(context.l10n.commonDelete),
                        ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}

class _DriveMessageCard extends StatelessWidget {
  const _DriveMessageCard({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return FinanceEmptyState(
      icon: Icons.folder_copy_outlined,
      title: context.l10n.driveTitle,
      body: message,
    );
  }
}

class _DrivePreviewPage extends StatelessWidget {
  const _DrivePreviewPage({
    required this.title,
    required this.signedUrl,
  });

  final String title;
  final String signedUrl;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(title)),
      body: InAppWebView(
        initialUrlRequest: URLRequest(url: WebUri(signedUrl)),
      ),
    );
  }
}

class _MetricChip extends StatelessWidget {
  const _MetricChip({
    required this.label,
    required this.value,
    this.icon,
    this.tint,
  });

  final String label;
  final String value;
  final IconData? icon;
  final Color? tint;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final effectiveTint = tint ?? theme.colorScheme.primary;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        color: effectiveTint.withValues(alpha: 0.10),
        border: Border.all(color: effectiveTint.withValues(alpha: 0.22)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 15, color: effectiveTint),
            const SizedBox(width: 8),
          ],
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                value,
                style: theme.typography.small.copyWith(
                  fontWeight: FontWeight.w700,
                ),
              ),
              Text(
                label,
                style: theme.typography.xSmall.copyWith(
                  color: theme.colorScheme.mutedForeground,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

String _formatBytes(int bytes) {
  if (bytes <= 0) return '0 B';
  const suffixes = ['B', 'KB', 'MB', 'GB', 'TB'];
  var value = bytes.toDouble();
  var index = 0;
  while (value >= 1024 && index < suffixes.length - 1) {
    value /= 1024;
    index += 1;
  }
  return '${value.toStringAsFixed(index == 0 ? 0 : 1)} ${suffixes[index]}';
}

String _formatDate(String? value) {
  if (value == null) return '';
  final parsed = DateTime.tryParse(value);
  if (parsed == null) return '';
  return DateFormat.yMMMd().add_Hm().format(parsed.toLocal());
}
