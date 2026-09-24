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
  Widget build(BuildContext context) => _SectionCard(
    accentModuleId: 'mail',
    title: context.l10n.dashboardMailInbox,
    icon: Icons.mail_outline_rounded,
    actionLabel: context.l10n.dashboardOpenTasks,
    onTap: () => context.go(Routes.mail),
    child: !_loaded && _items.isEmpty
        ? const Center(child: NovaLoadingIndicator(size: 18))
        : _items.isEmpty
        ? Text(context.l10n.mailEmpty)
        : Column(
            children: [
              for (final item in _items)
                InkWell(
                  onTap: () => context.go(Routes.mail),
                  borderRadius: BorderRadius.circular(10),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    child: Row(
                      children: [
                        Icon(
                          Icons.circle,
                          size: 7,
                          color: item['unread'] == true
                              ? Theme.of(context).colorScheme.primary
                              : Theme.of(context).colorScheme.outline,
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            (item['subject'] as String?) ??
                                context.l10n.mailNoSubject,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        const SizedBox(width: 4),
                        const Icon(Icons.chevron_right_rounded, size: 18),
                      ],
                    ),
                  ),
                ),
            ],
          ),
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
  Widget build(BuildContext context) => _SectionCard(
    accentModuleId: 'meet',
    title: context.l10n.dashboardUpcomingMeetings,
    icon: Icons.video_call_outlined,
    actionLabel: context.l10n.dashboardOpenTasks,
    onTap: () => context.go(Routes.meet),
    child: !_loaded && _meetings.isEmpty
        ? const Center(child: NovaLoadingIndicator(size: 18))
        : _meetings.isEmpty
        ? Text(context.l10n.dashboardNoUpcomingMeetings)
        : Column(
            children: [
              for (final meeting in _meetings.take(2))
                ListTile(
                  dense: true,
                  contentPadding: EdgeInsets.zero,
                  title: Text(
                    meeting.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  subtitle: Text(
                    DateFormat.MMMd().add_jm().format(meeting.time),
                    maxLines: 1,
                  ),
                  onTap: () => context.go(Routes.meet),
                ),
            ],
          ),
  );
}
