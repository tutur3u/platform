part of 'dashboard_page.dart';

class _DashboardMailCard extends StatefulWidget {
  const _DashboardMailCard({
    required this.workspaceId,
    required this.userId,
    super.key,
  });
  final String workspaceId;
  final String? userId;

  @override
  State<_DashboardMailCard> createState() => _DashboardMailCardState();
}

class _DashboardMailCardState extends State<_DashboardMailCard> {
  final MailRepository _repository = MailRepository();
  List<Map<String, dynamic>> _items = const [];
  bool _loaded = false;
  int _loadVersion = 0;

  @override
  void initState() {
    super.initState();
    unawaited(_load());
  }

  @override
  void didUpdateWidget(covariant _DashboardMailCard oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.workspaceId != widget.workspaceId ||
        oldWidget.userId != widget.userId) {
      _items = const [];
      _loaded = false;
      unawaited(_load());
    }
  }

  Future<void> _load({bool forceRefresh = false}) async {
    final version = ++_loadVersion;
    final wsId = widget.workspaceId;
    try {
      final saved = await _repository.savedView(wsId);
      if (mounted && version == _loadVersion && saved?['folder'] == 'inbox') {
        setState(() => _items = mailRows(saved?['items']).take(2).toList());
      }
      final bootstrap = await _repository.bootstrap(wsId);
      final mailboxId =
          (saved?['mailboxId'] as String?) ??
          (mailRows(bootstrap['mailboxes']).firstOrNull?['id'] as String?);
      if (mailboxId == null) return;
      final result = await _repository.list(
        wsId,
        mailboxId,
        folder: 'inbox',
        forceRefresh: forceRefresh,
      );
      if (mounted && version == _loadVersion) {
        setState(() => _items = mailRows(result['threads']).take(2).toList());
      }
    } on Object {
      // A Home preview must not interrupt navigation or clear cached mail.
    } finally {
      if (mounted && version == _loadVersion) {
        setState(() => _loaded = true);
      }
    }
  }

  @override
  void dispose() {
    _repository.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => _HomeSection(
    title: context.l10n.dashboardMailInbox,
    actionLabel: context.l10n.dashboardOpenTasks,
    onOpen: () => context.go(Routes.mail),
    children:
        _homeStateRows(
          context,
          loading: !_loaded && _items.isEmpty,
          failed: false,
          empty: _items.isEmpty,
          emptyIcon: LucideIcons.inbox,
          emptyTitle: context.l10n.mailEmpty,
        ) ??
        [
          for (final item in _items)
            Builder(
              builder: (context) {
                final unread = item['unread'] == true;
                return AppGroupedRow(
                  leading: AppIconTile(
                    icon: unread ? LucideIcons.mail : LucideIcons.mailOpen,
                    tone: unread ? AppTone.primary : AppTone.neutral,
                    badge: unread,
                  ),
                  title: Text(
                    (item['subject'] as String?) ?? context.l10n.mailNoSubject,
                    maxLines: 1,
                    style: unread
                        ? const TextStyle(fontWeight: FontWeight.w600)
                        : null,
                  ),
                  showChevron: true,
                  onTap: () => context.go(Routes.mail),
                );
              },
            ),
        ],
  );
}

class _DashboardMeetCard extends StatefulWidget {
  const _DashboardMeetCard({
    required this.workspaceId,
    required this.userId,
    super.key,
  });
  final String workspaceId;
  final String? userId;

  @override
  State<_DashboardMeetCard> createState() => _DashboardMeetCardState();
}

class _DashboardMeetCardState extends State<_DashboardMeetCard> {
  final MeetRepository _repository = MeetRepository();
  List<MeetMeeting> _meetings = const [];
  bool _loaded = false;
  int _loadVersion = 0;

  @override
  void initState() {
    super.initState();
    final cached = _repository.cachedMeetings(widget.workspaceId);
    if (cached != null) _meetings = _upcoming(cached.meetings);
    unawaited(_load());
  }

  @override
  void didUpdateWidget(covariant _DashboardMeetCard oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.workspaceId != widget.workspaceId ||
        oldWidget.userId != widget.userId) {
      _meetings = const [];
      _loaded = false;
      unawaited(_load());
    }
  }

  List<MeetMeeting> _upcoming(List<MeetMeeting> meetings) {
    final now = DateTime.now();
    return meetings.where((meeting) => meeting.time.isAfter(now)).toList()
      ..sort((a, b) => a.time.compareTo(b.time));
  }

  Future<void> _load({bool forceRefresh = false}) async {
    final version = ++_loadVersion;
    final wsId = widget.workspaceId;
    try {
      const pageSize = 100;
      final upcoming = <MeetMeeting>[];
      var pageNumber = 1;
      while (true) {
        final page = await _repository.listMeetings(
          wsId,
          page: pageNumber,
          pageSize: pageSize,
          forceRefresh: forceRefresh,
        );
        upcoming.addAll(_upcoming(page.meetings));
        // The endpoint sorts newest first. Once a page reaches the past,
        // every earlier meeting is past as well.
        if (page.meetings.any(
              (meeting) => !meeting.time.isAfter(DateTime.now()),
            ) ||
            pageNumber * pageSize >= page.totalCount ||
            page.meetings.isEmpty) {
          break;
        }
        pageNumber++;
      }
      if (mounted && version == _loadVersion) {
        setState(() => _meetings = _upcoming(upcoming));
      }
    } on Object {
      // Keep a cached preview if Meet is temporarily unavailable.
    } finally {
      if (mounted && version == _loadVersion) {
        setState(() => _loaded = true);
      }
    }
  }

  @override
  void dispose() {
    _repository.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final locale = Localizations.localeOf(context).toLanguageTag();
    return _HomeSection(
      title: context.l10n.dashboardUpcomingMeetings,
      actionLabel: context.l10n.dashboardOpenTasks,
      onOpen: () => context.go(Routes.meet),
      children:
          _homeStateRows(
            context,
            loading: !_loaded && _meetings.isEmpty,
            failed: false,
            empty: _meetings.isEmpty,
            emptyIcon: LucideIcons.video,
            emptyTitle: context.l10n.dashboardNoUpcomingMeetings,
          ) ??
          [
            for (final meeting in _meetings.take(2))
              AppGroupedRow(
                leading: const AppIconTile(
                  icon: LucideIcons.video,
                  tone: AppTone.info,
                ),
                title: Text(meeting.name, maxLines: 1),
                subtitle: Text(
                  DateFormat.MMMd(locale).add_jm().format(meeting.time),
                  maxLines: 1,
                ),
                showChevron: true,
                onTap: () => context.go(Routes.meet),
              ),
          ],
    );
  }
}
