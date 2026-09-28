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
  Widget build(BuildContext context) => _SectionCard(
    accentModuleId: 'finance',
    title: context.l10n.financeTitle,
    icon: Icons.account_balance_wallet_outlined,
    actionLabel: context.l10n.dashboardOpenTasks,
    onTap: () => context.go(Routes.finance),
    child: !_loaded
        ? const FinanceSkeletonBlock(height: 64, radius: 14)
        : _wallets.isEmpty
        ? Text(context.l10n.financeWallets)
        : Column(
            children: [
              for (final wallet in _wallets.take(2))
                ListTile(
                  dense: true,
                  contentPadding: EdgeInsets.zero,
                  title: Text(wallet.name ?? context.l10n.financeWallets),
                  trailing: const Icon(Icons.chevron_right_rounded),
                  onTap: () => context.go(Routes.walletDetailPath(wallet.id)),
                ),
            ],
          ),
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
  Widget build(BuildContext context) => _SectionCard(
    accentModuleId: 'notes',
    title: context.l10n.notesTitle,
    icon: Icons.edit_note_rounded,
    actionLabel: context.l10n.dashboardOpenTasks,
    onTap: () => context.go(Routes.notes),
    child: !_loaded
        ? const FinanceSkeletonBlock(height: 64, radius: 14)
        : _notes.isEmpty
        ? Text(context.l10n.notesEmpty)
        : Column(
            children: [
              for (final note in _notes.take(2))
                ListTile(
                  dense: true,
                  contentPadding: EdgeInsets.zero,
                  title: Text(
                    note.title.isEmpty ? context.l10n.notesTitle : note.title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  trailing: const Icon(Icons.chevron_right_rounded),
                  onTap: () => context.go(Routes.noteDetailPath(note.id)),
                ),
            ],
          ),
  );
}
