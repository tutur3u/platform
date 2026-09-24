part of 'dashboard_page.dart';

class _DashboardMailCard extends StatefulWidget {
  const _DashboardMailCard({required this.workspaceId, super.key});
  final String workspaceId;

  @override
  State<_DashboardMailCard> createState() => _DashboardMailCardState();
}

class _DashboardMailCardState extends State<_DashboardMailCard> {
  final MailRepository _repository = MailRepository();
  List<Map<String, dynamic>> _items = const [];
  bool _loaded = false;

  @override
  void initState() {
    super.initState();
    unawaited(_load());
  }

  Future<void> _load() async {
    try {
      final saved = await _repository.savedView(widget.workspaceId);
      if (mounted && saved?['folder'] == 'inbox') {
        setState(() => _items = mailRows(saved?['items']).take(2).toList());
      }
      final bootstrap = await _repository.bootstrap(widget.workspaceId);
      final mailboxId =
          (saved?['mailboxId'] as String?) ??
          (mailRows(bootstrap['mailboxes']).firstOrNull?['id'] as String?);
      if (mailboxId == null) return;
      final result = await _repository.list(
        widget.workspaceId,
        mailboxId,
        folder: 'inbox',
      );
      if (mounted) {
        setState(() => _items = mailRows(result['threads']).take(2).toList());
      }
    } on Object {
      // A Home preview must not interrupt navigation or clear cached mail.
    } finally {
      if (mounted) setState(() => _loaded = true);
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
    title: context.l10n.mailInbox,
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
                ListTile(
                  dense: true,
                  contentPadding: EdgeInsets.zero,
                  leading: Icon(
                    Icons.circle,
                    size: 8,
                    color: item['unread'] == true
                        ? Theme.of(context).colorScheme.primary
                        : Theme.of(context).colorScheme.outline,
                  ),
                  title: Text(
                    (item['subject'] as String?) ?? context.l10n.mailNoSubject,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  onTap: () => context.go(Routes.mail),
                ),
            ],
          ),
  );
}

class _DashboardMeetCard extends StatefulWidget {
  const _DashboardMeetCard({required this.workspaceId, super.key});
  final String workspaceId;

  @override
  State<_DashboardMeetCard> createState() => _DashboardMeetCardState();
}

class _DashboardMeetCardState extends State<_DashboardMeetCard> {
  final MeetRepository _repository = MeetRepository();
  List<MeetMeeting> _meetings = const [];
  bool _loaded = false;

  @override
  void initState() {
    super.initState();
    final cached = _repository.cachedMeetings(widget.workspaceId);
    if (cached != null) _meetings = _upcoming(cached.meetings);
    unawaited(_load());
  }

  List<MeetMeeting> _upcoming(List<MeetMeeting> meetings) {
    final now = DateTime.now();
    return meetings.where((meeting) => meeting.time.isAfter(now)).toList()
      ..sort((a, b) => a.time.compareTo(b.time));
  }

  Future<void> _load() async {
    try {
      final page = await _repository.listMeetings(
        widget.workspaceId,
        pageSize: 100,
      );
      if (mounted) setState(() => _meetings = _upcoming(page.meetings));
    } on Object {
      // Keep a cached preview if Meet is temporarily unavailable.
    } finally {
      if (mounted) setState(() => _loaded = true);
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
