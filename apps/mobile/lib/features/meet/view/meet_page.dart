import 'dart:async';

import 'package:flutter/material.dart' hide Card;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/responsive/responsive_padding.dart';
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:mobile/core/responsive/responsive_wrapper.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/data/models/meet/meet_meeting.dart';
import 'package:mobile/data/repositories/meet_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/finance/widgets/finance_ui.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/view/shell_chrome_actions.dart';
import 'package:mobile/features/shell/view/shell_mini_nav.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class MeetPage extends StatefulWidget {
  const MeetPage({super.key, this.repository});

  final MeetRepository? repository;

  @override
  State<MeetPage> createState() => _MeetPageState();
}

class _MeetPageState extends State<MeetPage> {
  late final MeetRepository _repository;
  final TextEditingController _searchController = TextEditingController();
  Timer? _searchDebounce;

  List<MeetMeeting> _meetings = const <MeetMeeting>[];
  bool _isLoading = false;
  bool _isLoadingMore = false;
  String? _error;
  int _page = 1;
  int _total = 0;
  int _requestToken = 0;

  String? get _wsId =>
      context.read<WorkspaceCubit>().state.currentWorkspace?.id;

  bool get _hasMore => _meetings.length < _total;

  @override
  void initState() {
    super.initState();
    _repository = widget.repository ?? MeetRepository();
    unawaited(Future<void>.delayed(Duration.zero, _reload));
  }

  @override
  void dispose() {
    _searchDebounce?.cancel();
    _searchController.dispose();
    if (widget.repository == null) {
      _repository.dispose();
    }
    super.dispose();
  }

  Future<void> _reload({bool append = false}) async {
    final wsId = _wsId;
    if (wsId == null || wsId.isEmpty) return;

    final requestToken = ++_requestToken;
    final nextPage = append ? _page + 1 : 1;
    setState(() {
      if (append) {
        _isLoadingMore = true;
      } else {
        _isLoading = true;
        _error = null;
      }
    });

    try {
      final page = await _repository.listMeetings(
        wsId,
        search: _searchController.text,
        page: nextPage,
      );
      if (!mounted || requestToken != _requestToken) return;
      setState(() {
        _meetings = append
            ? <MeetMeeting>[..._meetings, ...page.meetings]
            : page.meetings;
        _page = page.page;
        _total = page.totalCount;
      });
    } on ApiException catch (error) {
      if (!mounted || requestToken != _requestToken) return;
      setState(() => _error = error.message);
    } on Object {
      if (!mounted || requestToken != _requestToken) return;
      setState(() => _error = context.l10n.commonSomethingWentWrong);
    } finally {
      if (mounted && requestToken == _requestToken) {
        setState(() {
          _isLoading = false;
          _isLoadingMore = false;
        });
      }
    }
  }

  void _onSearchChanged(String value) {
    _searchDebounce?.cancel();
    _searchDebounce = Timer(const Duration(milliseconds: 300), () {
      unawaited(_reload());
    });
  }

  Future<void> _loadMore() async {
    if (_isLoading || _isLoadingMore || !_hasMore) return;
    await _reload(append: true);
  }

  Future<void> _showMeetingEditor([MeetMeeting? meeting]) async {
    final wsId = _wsId;
    if (wsId == null || wsId.isEmpty) return;

    final nameController = TextEditingController(text: meeting?.name ?? '');
    var selectedTime = meeting?.time ?? DateTime.now();

    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (context) => StatefulBuilder(
        builder: (context, setSheetState) {
          final formattedTime = DateFormat.yMMMd().add_jm().format(
            selectedTime.toLocal(),
          );
          return Padding(
            padding: EdgeInsets.fromLTRB(
              20,
              20,
              20,
              20 + MediaQuery.viewInsetsOf(context).bottom,
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  meeting == null
                      ? context.l10n.meetNewMeeting
                      : context.l10n.meetEditMeeting,
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: nameController,
                  autofocus: true,
                  decoration: InputDecoration(
                    labelText: context.l10n.meetMeetingName,
                  ),
                ),
                const SizedBox(height: 12),
                OutlinedButton.icon(
                  onPressed: () async {
                    final date = await showDatePicker(
                      context: context,
                      initialDate: selectedTime,
                      firstDate: DateTime(2000),
                      lastDate: DateTime(2100),
                    );
                    if (date == null || !context.mounted) return;
                    final time = await showTimePicker(
                      context: context,
                      initialTime: TimeOfDay.fromDateTime(selectedTime),
                    );
                    if (time == null) return;
                    setSheetState(() {
                      selectedTime = DateTime(
                        date.year,
                        date.month,
                        date.day,
                        time.hour,
                        time.minute,
                      );
                    });
                  },
                  icon: const Icon(Icons.schedule_rounded),
                  label: Text(formattedTime),
                ),
                const SizedBox(height: 16),
                FilledButton(
                  onPressed: () => Navigator.of(context).pop(true),
                  child: Text(context.l10n.commonSave),
                ),
              ],
            ),
          );
        },
      ),
    );

    final name = nameController.text.trim();
    nameController.dispose();
    if (saved != true || name.isEmpty) return;

    try {
      if (meeting == null) {
        await _repository.createMeeting(wsId, name: name, time: selectedTime);
        if (!mounted) return;
        _toast(context.l10n.meetCreated);
      } else {
        await _repository.updateMeeting(
          wsId,
          meeting.id,
          name: name,
          time: selectedTime,
        );
        if (!mounted) return;
        _toast(context.l10n.meetUpdated);
      }
      await _reload();
    } on ApiException catch (error) {
      if (!mounted) return;
      _toast(error.message, destructive: true);
    }
  }

  Future<void> _deleteMeeting(MeetMeeting meeting) async {
    final wsId = _wsId;
    if (wsId == null || wsId.isEmpty) return;

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(context.l10n.meetDelete),
        content: Text(context.l10n.meetDeleteConfirm),
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
      await _repository.deleteMeeting(wsId, meeting.id);
      if (!mounted) return;
      _toast(context.l10n.meetDeleted);
      await _reload();
    } on ApiException catch (error) {
      if (!mounted) return;
      _toast(error.message, destructive: true);
    }
  }

  void _toast(String message, {bool destructive = false}) {
    shad.showToast(
      context: context,
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

    return BlocListener<WorkspaceCubit, WorkspaceState>(
      listenWhen: (previous, current) =>
          previous.currentWorkspace?.id != current.currentWorkspace?.id,
      listener: (context, state) {
        setState(() => _meetings = const <MeetMeeting>[]);
        unawaited(_reload());
      },
      child: shad.Scaffold(
        child: Stack(
          children: [
            ShellMiniNav(
              ownerId: 'meet-root-nav',
              locations: const {Routes.meet},
              deepLinkBackRoute: Routes.apps,
              items: [
                ShellMiniNavItemSpec(
                  id: 'meet-back',
                  icon: Icons.chevron_left,
                  label: context.l10n.navBack,
                  callbackToken: 'back',
                  onPressed: () => context.go(Routes.apps),
                ),
                ShellMiniNavItemSpec(
                  id: 'meet-home',
                  icon: Icons.video_call_outlined,
                  label: context.l10n.meetTitle,
                  callbackToken: true,
                  selected: true,
                  enabled: hasWorkspace,
                  onPressed: () {},
                ),
              ],
            ),
            ShellChromeActions(
              ownerId: 'meet-root-actions',
              locations: const {Routes.meet},
              actions: [
                ShellActionSpec(
                  id: 'meet-refresh',
                  icon: Icons.refresh_rounded,
                  tooltip: context.l10n.commonRefresh,
                  callbackToken: _isLoading,
                  enabled: hasWorkspace && !_isLoading,
                  onPressed: _reload,
                ),
                ShellActionSpec(
                  id: 'meet-create',
                  icon: Icons.add_rounded,
                  tooltip: context.l10n.meetNewMeeting,
                  callbackToken: hasWorkspace,
                  enabled: hasWorkspace,
                  onPressed: _showMeetingEditor,
                ),
              ],
            ),
            ResponsiveWrapper(
              maxWidth: ResponsivePadding.maxContentWidth(context.deviceClass),
              child: RefreshIndicator(
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
                      title: context.l10n.meetTitle,
                      subtitle: context.l10n.meetSubtitle,
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: _searchController,
                      onChanged: _onSearchChanged,
                      decoration: InputDecoration(
                        hintText: context.l10n.meetSearchHint,
                        prefixIcon: const Icon(Icons.search_rounded),
                      ),
                    ),
                    const SizedBox(height: 16),
                    if (_isLoading && _meetings.isEmpty)
                      const SizedBox(
                        height: 240,
                        child: Center(child: NovaLoadingIndicator()),
                      )
                    else if (_error != null)
                      _MeetMessageCard(message: _error!)
                    else if (_meetings.isEmpty)
                      _MeetMessageCard(
                        message: context.l10n.meetEmptyDescription,
                      )
                    else
                      ..._meetings.map(
                        (meeting) => Padding(
                          padding: const EdgeInsets.only(bottom: 12),
                          child: _MeetingTile(
                            meeting: meeting,
                            onTap: () => _showMeetingEditor(meeting),
                            onDelete: () => _deleteMeeting(meeting),
                          ),
                        ),
                      ),
                    if (_hasMore) ...[
                      const SizedBox(height: 8),
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

class _MeetingTile extends StatelessWidget {
  const _MeetingTile({
    required this.meeting,
    required this.onTap,
    required this.onDelete,
  });

  final MeetMeeting meeting;
  final VoidCallback onTap;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final formattedTime = DateFormat.yMMMd().add_jm().format(
      meeting.time.toLocal(),
    );
    return FinancePanel(
      onTap: onTap,
      padding: const EdgeInsets.all(16),
      child: Row(
        children: [
          Container(
            width: 46,
            height: 46,
            decoration: BoxDecoration(
              color: theme.colorScheme.primary.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(16),
            ),
            child: Icon(
              Icons.video_call_outlined,
              color: theme.colorScheme.primary,
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  meeting.name,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 17,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  formattedTime,
                  style: TextStyle(color: theme.colorScheme.mutedForeground),
                ),
                if (meeting.recordingSessions.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  Text(
                    context.l10n.meetRecordingSessions(
                      meeting.recordingSessions.length,
                    ),
                    style: TextStyle(color: theme.colorScheme.primary),
                  ),
                ],
              ],
            ),
          ),
          IconButton(
            onPressed: onDelete,
            icon: const Icon(Icons.delete_outline_rounded),
          ),
        ],
      ),
    );
  }
}

class _MeetMessageCard extends StatelessWidget {
  const _MeetMessageCard({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return FinancePanel(
      child: Text(
        message,
        textAlign: TextAlign.center,
        style: TextStyle(color: shad.Theme.of(context).colorScheme.foreground),
      ),
    );
  }
}
