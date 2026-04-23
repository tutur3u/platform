// This screen keeps app-local imports adjacent for scanability.
// ignore_for_file: directives_ordering

import 'dart:async';
import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';
import 'package:intl/intl.dart';
import 'package:mime/mime.dart';
import 'package:mobile/core/responsive/responsive_padding.dart';
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:mobile/core/responsive/responsive_wrapper.dart';
import 'package:mobile/data/models/drive/drive_models.dart';
import 'package:mobile/data/repositories/drive_repository.dart';
import 'package:mobile/data/repositories/workspace_permissions_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
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

  DriveAnalytics? _analytics;
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
      final analyticsFuture = _repository.getAnalytics(wsId);
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
        analyticsFuture,
        listFuture,
      ]);

      if (!mounted || requestToken != _requestToken) return;

      final permissions = results[0] as WorkspacePermissions;
      final analytics = results[1] as DriveAnalytics;
      final listResult = results[2] as DriveListResult;

      setState(() {
        _canManageDrive = permissions.containsPermission('manage_drive');
        _analytics = analytics;
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
        child: ResponsiveWrapper(
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
                      _DriveSummaryCard(analytics: _analytics),
                      const SizedBox(height: 16),
                      _DriveToolbar(
                        path: _path,
                        showGrid: _showGrid,
                        sortBy: _sortBy,
                        sortOrder: _sortOrder,
                        searchController: _searchController,
                        onSearchChanged: _onSearchChanged,
                        onToggleView: () {
                          setState(() => _showGrid = !_showGrid);
                        },
                        onSortChanged: (sortBy, sortOrder) {
                          setState(() {
                            _sortBy = sortBy;
                            _sortOrder = sortOrder;
                          });
                          unawaited(_reload());
                        },
                        onGoUp: _path.isEmpty
                            ? null
                            : () {
                                final parts = _path.split('/')..removeLast();
                                setState(() {
                                  _path = parts.join('/');
                                  _selectedNames.clear();
                                });
                                unawaited(_reload());
                              },
                        onCreateFolder: _canManageDrive
                            ? _showCreateFolderDialog
                            : null,
                        onUpload: _canManageDrive ? _uploadFiles : null,
                        selectedCount: _selectedNames.length,
                        onDeleteSelected: _selectedNames.isEmpty
                            ? null
                            : () => _deleteEntries(
                                _entries
                                    .where(
                                      (entry) =>
                                          _selectedNames.contains(entry.name),
                                    )
                                    .toList(growable: false),
                              ),
                      ),
                      const SizedBox(height: 16),
                      if (_error != null && !_canManageDrive)
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
      ),
    );
  }
}

class _DriveSummaryCard extends StatelessWidget {
  const _DriveSummaryCard({required this.analytics});

  final DriveAnalytics? analytics;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final usage = analytics?.usagePercentage ?? 0;
    final formatter = NumberFormat.compact();
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              l10n.driveTitle,
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 12),
            LinearProgressIndicator(value: usage <= 0 ? 0 : usage / 100),
            const SizedBox(height: 12),
            Wrap(
              spacing: 12,
              runSpacing: 12,
              children: [
                _MetricChip(
                  label: l10n.driveUsageLabel,
                  value: '${usage.toStringAsFixed(1)}%',
                ),
                _MetricChip(
                  label: l10n.driveFilesLabel,
                  value: formatter.format(analytics?.fileCount ?? 0),
                ),
                _MetricChip(
                  label: l10n.driveUsedLabel,
                  value: _formatBytes(analytics?.totalSize ?? 0),
                ),
                _MetricChip(
                  label: l10n.driveLimitLabel,
                  value: _formatBytes(analytics?.storageLimit ?? 0),
                ),
              ],
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
    required this.showGrid,
    required this.sortBy,
    required this.sortOrder,
    required this.searchController,
    required this.onSearchChanged,
    required this.onToggleView,
    required this.onSortChanged,
    required this.onGoUp,
    required this.onCreateFolder,
    required this.onUpload,
    required this.selectedCount,
    required this.onDeleteSelected,
  });

  final String path;
  final bool showGrid;
  final String sortBy;
  final String sortOrder;
  final TextEditingController searchController;
  final ValueChanged<String> onSearchChanged;
  final VoidCallback onToggleView;
  final void Function(String sortBy, String sortOrder) onSortChanged;
  final VoidCallback? onGoUp;
  final VoidCallback? onCreateFolder;
  final VoidCallback? onUpload;
  final int selectedCount;
  final VoidCallback? onDeleteSelected;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(path.isEmpty ? l10n.driveRootLabel : path),
            const SizedBox(height: 12),
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
                if (onGoUp != null)
                  OutlinedButton.icon(
                    onPressed: onGoUp,
                    icon: const Icon(Icons.arrow_upward),
                    label: Text(l10n.driveGoUp),
                  ),
                FilledButton.tonalIcon(
                  onPressed: onToggleView,
                  icon: Icon(showGrid ? Icons.view_list : Icons.grid_view),
                  label: Text(
                    showGrid ? l10n.driveListView : l10n.driveGridView,
                  ),
                ),
                PopupMenuButton<String>(
                  tooltip: l10n.sortBy,
                  onSelected: (value) {
                    if (value == 'name_asc') onSortChanged('name', 'asc');
                    if (value == 'name_desc') onSortChanged('name', 'desc');
                    if (value == 'updated_desc') {
                      onSortChanged('updated_at', 'desc');
                    }
                    if (value == 'size_desc') onSortChanged('size', 'desc');
                  },
                  itemBuilder: (context) => [
                    PopupMenuItem(
                      value: 'name_asc',
                      child: Text(context.l10n.driveSortNameAsc),
                    ),
                    PopupMenuItem(
                      value: 'name_desc',
                      child: Text(context.l10n.driveSortNameDesc),
                    ),
                    PopupMenuItem(
                      value: 'updated_desc',
                      child: Text(context.l10n.driveSortUpdated),
                    ),
                    PopupMenuItem(
                      value: 'size_desc',
                      child: Text(context.l10n.driveSortSize),
                    ),
                  ],
                  child: FilledButton.tonalIcon(
                    onPressed: null,
                    icon: const Icon(Icons.sort),
                    label: Text(l10n.sortBy),
                  ),
                ),
                if (onCreateFolder != null)
                  FilledButton.tonalIcon(
                    onPressed: onCreateFolder,
                    icon: const Icon(Icons.create_new_folder_outlined),
                    label: Text(l10n.driveCreateFolder),
                  ),
                if (onUpload != null)
                  FilledButton.icon(
                    onPressed: onUpload,
                    icon: const Icon(Icons.upload_file_outlined),
                    label: Text(l10n.driveUploadFiles),
                  ),
                if (selectedCount > 0 && onDeleteSelected != null)
                  FilledButton.tonalIcon(
                    onPressed: onDeleteSelected,
                    icon: const Icon(Icons.delete_outline),
                    label: Text(
                      l10n.driveDeleteSelected(selectedCount),
                    ),
                  ),
              ],
            ),
          ],
        ),
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
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        onTap: onTap,
        onLongPress: onLongPress,
        leading: Icon(
          entry.isFolder
              ? Icons.folder_outlined
              : Icons.insert_drive_file_outlined,
        ),
        title: Text(entry.name),
        subtitle: Text(
          entry.isFolder
              ? context.l10n.driveFolderLabel
              : '${_formatBytes(entry.size)} • ${_formatDate(entry.updatedAt)}',
        ),
        trailing: Row(
          mainAxisSize: MainAxisSize.min,
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
        return Card(
          child: InkWell(
            onTap: () => onTap(entry),
            onLongPress: () => onToggleSelection(entry),
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Icon(
                        entry.isFolder
                            ? Icons.folder_outlined
                            : Icons.insert_drive_file_outlined,
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
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  const SizedBox(height: 8),
                  Text(
                    entry.isFolder
                        ? context.l10n.driveFolderLabel
                        : _formatBytes(entry.size),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.bodySmall,
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
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Text(message),
      ),
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
  });

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12),
        color: Theme.of(context).colorScheme.surfaceContainerHighest,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: Theme.of(context).textTheme.bodySmall),
          const SizedBox(height: 4),
          Text(value, style: Theme.of(context).textTheme.titleMedium),
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
