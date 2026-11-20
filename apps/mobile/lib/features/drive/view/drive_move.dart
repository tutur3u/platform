part of 'drive_page.dart';

extension _DriveMoveActions on _DrivePageState {
  List<DriveEntry> get _selectedEntries => [
    for (final entry in _entries)
      if (_selectedNames.contains(entry.name)) entry,
  ];

  Future<void> _moveEntries(List<DriveEntry> entries) async {
    final wsId = _wsId;
    final actorId = _actorId;
    final source = _path;
    final l10n = context.l10n;
    if (wsId == null || actorId == null || !_canManageDrive || _isMoving) {
      return;
    }
    if (entries.isEmpty) return;
    if (entries.length > DriveRepository.maxMoveEntries) {
      _toast(
        l10n.driveMoveLimit(DriveRepository.maxMoveEntries),
        destructive: true,
      );
      return;
    }

    bool current() =>
        _isDirectoryCurrent(wsId, actorId, source) && _canManageDrive;
    final auth = context.read<AuthCubit>();
    final workspace = context.read<WorkspaceCubit>();
    Widget scopedSheet(Widget child) => _DriveMoveScope(
      auth: auth,
      workspace: workspace,
      isCurrent: current,
      child: child,
    );

    _update(() => _isMoving = true);
    try {
      final destination = await showAppSheet<String>(
        context: context,
        size: AppSheetSize.large,
        builder: (_) => scopedSheet(
          _DriveFolderPicker(
            source: source,
            foldersBeingMoved: [
              for (final entry in entries)
                if (entry.isFolder) _driveChildPath(source, entry.name),
            ],
            isCurrent: current,
            load: (path, offset) => _repository.listDirectory(
              wsId,
              path: path,
              offset: offset,
              limit: _DrivePageState._pageSize,
            ),
          ),
        ),
      );
      if (destination == null || !mounted || !current()) return;

      final results = await _repository.moveEntries(
        wsId,
        source: source,
        destination: destination,
        entries: entries,
        actorId: actorId,
        isCurrent: current,
      );
      if (!mounted || !current()) return;

      final moved = results.where(
        (result) => result.status == DriveMoveStatus.moved,
      );
      await _reload();
      if (!mounted || !current()) return;
      final summary = l10n.driveMoveSummary(moved.length, results.length);
      if (moved.length == results.length) {
        _toast(summary);
      } else {
        await showAppSheet<void>(
          context: context,
          builder: (_) => scopedSheet(
            AppSheetScaffold(
              title: summary,
              child: AppGroupedCard(
                children: [
                  for (final result in results)
                    if (result.status != DriveMoveStatus.moved)
                      AppGroupedRow(
                        title: Text(result.name),
                        subtitle: Text(_moveResultDetail(result)),
                      ),
                ],
              ),
            ),
          ),
        );
      }
    } on ApiException catch (error) {
      if (!mounted || !current()) return;
      final message = switch ((error.code, error.statusCode)) {
        ('DRIVE_MOVE_PROVIDER', _) => l10n.driveMoveProvider,
        ('DRIVE_MOVE_CONFLICT', _) => l10n.driveMoveConflict,
        ('DRIVE_MOVE_SIZE', _) => l10n.driveMoveSizeUnknown,
        (_, 403) => l10n.drivePermissionDenied,
        (_, 404) => l10n.driveMoveMissing,
        (_, 413) => l10n.driveMoveTooLarge,
        (_, 0) => l10n.driveMoveUncertain,
        (_, final status) when status >= 500 => l10n.driveMoveUncertain,
        _ => l10n.commonSomethingWentWrong,
      };
      _toast(message, destructive: true);
      await _reload();
    } on Exception {
      if (!mounted || !current()) return;
      _toast(l10n.driveMoveUncertain, destructive: true);
      await _reload();
    } finally {
      if (mounted) _update(() => _isMoving = false);
    }
  }

  String _moveResultDetail(DriveMoveResult result) {
    final l10n = context.l10n;
    final reason = switch (result.status) {
      DriveMoveStatus.conflict => l10n.driveMoveConflict,
      DriveMoveStatus.missing => l10n.driveMoveMissing,
      DriveMoveStatus.uncertain => l10n.driveMoveUncertain,
      DriveMoveStatus.skipped => l10n.driveMoveSkipped,
      DriveMoveStatus.moved => '',
    };
    if (result.totalFiles == 0) return reason;
    return l10n.driveMovePartial(result.movedFiles, result.totalFiles, reason);
  }
}

class _DriveMoveScope extends StatelessWidget {
  const _DriveMoveScope({
    required this.auth,
    required this.workspace,
    required this.isCurrent,
    required this.child,
  });

  final AuthCubit auth;
  final WorkspaceCubit workspace;
  final bool Function() isCurrent;
  final Widget child;

  void _dismissRetiredSheet(BuildContext context) {
    if (isCurrent()) return;
    final route = ModalRoute.of(context);
    if (route != null && route.isActive) {
      Navigator.of(context).removeRoute(route);
    }
  }

  @override
  Widget build(BuildContext context) => MultiBlocListener(
    listeners: [
      BlocListener<AuthCubit, AuthState>(
        bloc: auth,
        listener: (context, state) => _dismissRetiredSheet(context),
      ),
      BlocListener<WorkspaceCubit, WorkspaceState>(
        bloc: workspace,
        listener: (context, state) => _dismissRetiredSheet(context),
      ),
    ],
    child: child,
  );
}

String _driveChildPath(String parent, String name) =>
    parent.isEmpty ? name : '$parent/$name';

class _DriveFolderPicker extends StatefulWidget {
  const _DriveFolderPicker({
    required this.source,
    required this.foldersBeingMoved,
    required this.isCurrent,
    required this.load,
  });

  final String source;
  final List<String> foldersBeingMoved;
  final bool Function() isCurrent;
  final Future<DriveListResult> Function(String path, int offset) load;

  @override
  State<_DriveFolderPicker> createState() => _DriveFolderPickerState();
}

class _DriveFolderPickerState extends State<_DriveFolderPicker> {
  String _path = '';
  List<DriveEntry> _folders = const [];
  int _nextOffset = 0;
  int _generation = 0;
  bool _hasMore = false;
  bool _loading = true;
  bool _failed = false;

  bool _excluded(String path) => widget.foldersBeingMoved.any(
    (folder) => path == folder || path.startsWith('$folder/'),
  );

  @override
  void initState() {
    super.initState();
    unawaited(_load());
  }

  Future<void> _load({bool append = false}) async {
    final generation = ++_generation;
    final path = _path;
    if (!widget.isCurrent()) return;
    setState(() {
      _loading = true;
      _failed = false;
    });
    try {
      final result = await widget.load(path, append ? _nextOffset : 0);
      if (!mounted || generation != _generation || !widget.isCurrent()) return;
      setState(() {
        _folders = {
          if (append)
            for (final folder in _folders) folder.name: folder,
          for (final folder in result.entries)
            if (folder.isFolder &&
                !_excluded(_driveChildPath(path, folder.name)))
              folder.name: folder,
        }.values.toList(growable: false);
        _nextOffset = result.offset + result.limit;
        _hasMore = result.hasMore && result.limit > 0;
        _loading = false;
      });
    } on Exception {
      if (!mounted || generation != _generation || !widget.isCurrent()) return;
      setState(() {
        _loading = false;
        _failed = true;
      });
    }
  }

  void _open(String path) {
    setState(() {
      _path = path;
      _folders = const [];
      _nextOffset = 0;
      _hasMore = false;
    });
    unawaited(_load());
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final path = _path;
    return AppSheetScaffold(
      title: l10n.driveMoveTitle,
      description: path.isEmpty ? l10n.driveRootLabel : path,
      headerActions: [
        if (path.isNotEmpty)
          AppIconButton(
            tooltip: l10n.driveGoUp,
            icon: const Icon(LucideIcons.arrowUp),
            onPressed: () {
              final parts = path.split('/')..removeLast();
              _open(parts.join('/'));
            },
          ),
      ],
      actions: [
        AppButton.primary(
          onPressed:
              !widget.isCurrent() ||
                  _loading ||
                  _failed ||
                  widget.source == path ||
                  _excluded(path)
              ? null
              : () => Navigator.of(context).pop(path),
          child: Text(l10n.driveMoveHere),
        ),
      ],
      child: AppGroupedCard(
        children: [
          for (final folder in _folders)
            AppGroupedRow(
              leading: const AppIconTile(
                icon: LucideIcons.folder,
                tone: AppTone.info,
              ),
              title: Text(folder.name),
              onTap: () => _open(_driveChildPath(path, folder.name)),
              showChevron: true,
            ),
          if (_loading)
            const AppSkeletonRows()
          else if (_failed)
            AppStateMessage.inline(
              icon: LucideIcons.circleAlert,
              title: l10n.commonSomethingWentWrong,
              actionLabel: l10n.commonRetry,
              onAction: () => _load(append: _nextOffset > 0),
            )
          else if (_hasMore)
            AppGroupedRow(
              title: Text(l10n.commonLoadMore),
              onTap: () => unawaited(_load(append: true)),
            )
          else if (_folders.isEmpty)
            AppStateMessage.inline(
              icon: LucideIcons.folder,
              title: l10n.driveMoveNoFolders,
            ),
        ],
      ),
    );
  }
}
