part of 'dashboard_page.dart';

class _DashboardFinanceCard extends StatefulWidget {
  const _DashboardFinanceCard({
    required this.workspaceId,
    required this.userId,
    super.key,
  });

  final String workspaceId;
  final String? userId;

  @override
  State<_DashboardFinanceCard> createState() => _DashboardFinanceCardState();
}

class _DashboardFinanceCardState extends State<_DashboardFinanceCard> {
  final _repository = FinanceRepository();
  List<Wallet> _wallets = const [];
  int _request = 0;
  bool _loaded = false;

  CacheKey get _key => CacheKey(
    namespace: 'dashboard.finance.wallets',
    userId: widget.userId,
    workspaceId: widget.workspaceId,
  );

  @override
  void initState() {
    super.initState();
    unawaited(_load());
  }

  @override
  void didUpdateWidget(covariant _DashboardFinanceCard oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.workspaceId != widget.workspaceId ||
        oldWidget.userId != widget.userId) {
      _wallets = const [];
      _loaded = false;
      unawaited(_load());
    }
  }

  Future<void> _load({bool forceRefresh = false}) async {
    final request = ++_request;
    if (widget.userId == null) return;
    final key = _key;
    final cached = await CacheStore.instance.read<List<Wallet>>(
      key: key,
      decode: (json) => (json as List<Object?>? ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(Wallet.fromJson)
          .toList(growable: false),
    );
    if (mounted && request == _request && cached.hasValue) {
      setState(() {
        _wallets = cached.data!;
        _loaded = true;
      });
    }
    try {
      final wallets = await _repository.getWallets(widget.workspaceId);
      if (!mounted || request != _request) return;
      setState(() {
        _wallets = wallets;
        _loaded = true;
      });
      await CacheStore.instance.write(
        key: key,
        policy: CachePolicies.summary,
        payload: wallets.map((wallet) => wallet.toJson()).toList(),
        tags: ['module:finance', 'workspace:${widget.workspaceId}'],
      );
    } on Exception {
      if (mounted && request == _request) setState(() => _loaded = true);
    }
  }

  @override
  void dispose() {
    _request++;
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => _HomeSection(
    title: context.l10n.financeTitle,
    actionLabel: context.l10n.dashboardOpenTasks,
    onOpen: () => context.go(Routes.finance),
    children:
        _homeStateRows(
          context,
          loading: !_loaded,
          failed: false,
          empty: _wallets.isEmpty,
          emptyIcon: LucideIcons.wallet,
          emptyTitle: context.l10n.financeWallets,
        ) ??
        [
          for (final wallet in _wallets.take(2))
            AppGroupedRow(
              leading: const AppIconTile(
                icon: LucideIcons.wallet,
                tone: AppTone.success,
              ),
              title: Text(
                wallet.name ?? context.l10n.financeWallets,
                maxLines: 1,
              ),
              showChevron: true,
              onTap: () => context.go(Routes.walletDetailPath(wallet.id)),
            ),
        ],
  );
}

class _DashboardNotesCard extends StatefulWidget {
  const _DashboardNotesCard({
    required this.workspaceId,
    required this.userId,
    super.key,
  });

  final String workspaceId;
  final String? userId;

  @override
  State<_DashboardNotesCard> createState() => _DashboardNotesCardState();
}

class _DashboardNotesCardState extends State<_DashboardNotesCard> {
  final _repository = NoteRepository();
  List<NoteRecord> _notes = const [];
  int _request = 0;
  bool _loaded = false;

  @override
  void initState() {
    super.initState();
    unawaited(_load());
  }

  @override
  void didUpdateWidget(covariant _DashboardNotesCard oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.workspaceId != widget.workspaceId ||
        oldWidget.userId != widget.userId) {
      _notes = const [];
      _loaded = false;
      unawaited(_load());
    }
  }

  Future<void> _load({bool forceRefresh = false}) async {
    final request = ++_request;
    if (widget.userId == null) return;
    try {
      final cached = await _repository.cached(widget.workspaceId);
      if (mounted && request == _request && cached.isNotEmpty) {
        setState(() {
          _notes = cached;
          _loaded = true;
        });
      }
      final notes = await _repository.refresh(widget.workspaceId);
      if (!mounted || request != _request) return;
      setState(() {
        _notes = notes;
        _loaded = true;
      });
    } on Exception {
      if (mounted && request == _request) setState(() => _loaded = true);
    }
  }

  @override
  void dispose() {
    _request++;
    _repository.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => _HomeSection(
    title: context.l10n.notesTitle,
    actionLabel: context.l10n.dashboardOpenTasks,
    onOpen: () => context.go(Routes.notes),
    children:
        _homeStateRows(
          context,
          loading: !_loaded,
          failed: false,
          empty: _notes.isEmpty,
          emptyIcon: LucideIcons.notebookPen,
          emptyTitle: context.l10n.notesEmpty,
        ) ??
        [
          for (final note in _notes.take(2))
            AppGroupedRow(
              leading: const AppIconTile(icon: LucideIcons.notebookPen),
              title: Text(
                note.title.isEmpty ? context.l10n.notesTitle : note.title,
                maxLines: 1,
              ),
              showChevron: true,
              onTap: () => context.go(Routes.noteDetailPath(note.id)),
            ),
        ],
  );
}
