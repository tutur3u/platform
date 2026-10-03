import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/calendar_repository.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/calendar/cubit/calendar_cubit.dart';
import 'package:mobile/features/calendar/widgets/agenda_view.dart';
import 'package:mobile/features/calendar/widgets/event_detail_sheet.dart';
import 'package:mobile/features/shell/view/floating_shell_dock.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';

Workspace? homePersonalWorkspace(Iterable<Workspace> memberships) =>
    memberships.where((workspace) => workspace.personal).firstOrNull;

class PersonalAgenda extends StatelessWidget {
  const PersonalAgenda({this.replayToken = 0, this.repository, super.key});
  final int replayToken;
  final CalendarRepository? repository;

  @override
  Widget build(BuildContext context) {
    final userId = context.watch<AuthCubit>().state.user?.id;
    final workspace = homePersonalWorkspace(
      context.watch<WorkspaceCubit>().state.workspaces,
    );
    if (userId == null || currentCacheUserId() != userId || workspace == null) {
      return Center(child: Text(context.l10n.homePersonalAgendaUnavailable));
    }
    // Recreate on account or membership changes; never reuse another scope's
    // visible events, and never fall back to a shared workspace.
    return BlocProvider(
      key: ValueKey('personal-agenda:$userId:${workspace.id}'),
      create: (_) {
        final cubit = _PersonalAgendaCubit(
          repository: repository ?? CalendarRepository(),
          ownsRepository: repository == null,
          initialState: CalendarCubit.seedStateForWorkspace(workspace.id),
        );
        unawaited(cubit.loadEvents(workspace.id, forceRefresh: true));
        return cubit;
      },
      child: PersonalAgendaView(
        workspaceId: workspace.id,
        replayToken: replayToken,
      ),
    );
  }
}

class _PersonalAgendaCubit extends CalendarCubit {
  _PersonalAgendaCubit({
    required this.repository,
    required this.ownsRepository,
    super.initialState,
  }) : super(calendarRepository: repository);

  final CalendarRepository repository;
  final bool ownsRepository;

  @override
  Future<void> close() async {
    await super.close();
    if (ownsRepository) repository.dispose();
  }
}

class PersonalAgendaView extends StatefulWidget {
  const PersonalAgendaView({
    required this.workspaceId,
    required this.replayToken,
    super.key,
  });
  final String workspaceId;
  final int replayToken;

  @override
  State<PersonalAgendaView> createState() => PersonalAgendaViewState();
}

class PersonalAgendaViewState extends State<PersonalAgendaView> {
  @override
  void didUpdateWidget(covariant PersonalAgendaView oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.replayToken != oldWidget.replayToken) unawaited(_refresh());
  }

  Future<void> _refresh() => context.read<CalendarCubit>().loadEvents(
    widget.workspaceId,
    forceRefresh: true,
  );

  @override
  Widget build(BuildContext context) => Padding(
    padding: EdgeInsets.only(top: floatingShellHeaderInset(context)),
    child: BlocBuilder<CalendarCubit, CalendarState>(
      builder: (context, state) => Column(
        children: [
          if (state.error != null)
            Row(
              children: [
                Expanded(
                  child: Semantics(
                    liveRegion: true,
                    child: Text(context.l10n.homePersonalAgendaUnavailable),
                  ),
                ),
                TextButton.icon(
                  onPressed: state.isRefreshing ? null : _refresh,
                  icon: const Icon(Icons.refresh),
                  label: Text(context.l10n.commonRetry),
                ),
              ],
            ),
          if (state.isRefreshing && state.hasLoadedOnce)
            const SizedBox(height: 2, child: LinearProgressIndicator()),
          Expanded(
            child: !state.hasLoadedOnce && state.error == null
                ? const Center(child: NovaLoadingIndicator())
                : RefreshIndicator(
                    onRefresh: _refresh,
                    child: state.events.isEmpty
                        ? ListView(
                            physics: const AlwaysScrollableScrollPhysics(),
                            children: [
                              Padding(
                                padding: const EdgeInsets.all(32),
                                child: Text(context.l10n.calendarAgendaEmpty),
                              ),
                            ],
                          )
                        : AgendaView(
                            selectedDate: state.effectiveSelectedDate,
                            events: state.displayEvents,
                            isLoadingMore: state.isLoadingMore,
                            onLoadMore: () => context
                                .read<CalendarCubit>()
                                .loadMoreForward(widget.workspaceId),
                            onDaySelected: context
                                .read<CalendarCubit>()
                                .selectDate,
                            // Home never mutates the global workspace.
                            onEventTap: (event) => unawaited(
                              showEventDetailSheet(
                                context,
                                event: event,
                                readOnly: true,
                              ),
                            ),
                          ),
                  ),
          ),
        ],
      ),
    ),
  );
}
