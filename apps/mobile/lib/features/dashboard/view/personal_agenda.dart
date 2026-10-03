import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/calendar_repository.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/calendar/cubit/calendar_cubit.dart';
import 'package:mobile/features/calendar/widgets/agenda_view.dart';
import 'package:mobile/features/calendar/widgets/event_detail_sheet.dart';
import 'package:mobile/features/dashboard/view/personal_agenda_scope.dart';
import 'package:mobile/features/profile/personal_profile_workspace.dart';
import 'package:mobile/features/settings/cubit/timezone_settings_cubit.dart';
import 'package:mobile/features/shell/view/floating_shell_dock.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';

Workspace? homePersonalWorkspace(Iterable<Workspace> memberships) =>
    memberships.where((workspace) => workspace.personal).firstOrNull;

class PersonalAgenda extends StatelessWidget {
  const PersonalAgenda({
    this.replayToken = 0,
    this.repository,
    this.cacheUserId,
    super.key,
  });
  final int replayToken;
  final CalendarRepository? repository;
  final String? Function()? cacheUserId;

  @override
  Widget build(BuildContext context) {
    final userId = context.watch<AuthCubit>().state.user?.id;
    final workspace = verifiedPersonalProfileWorkspace(
      userId: userId,
      cacheUserId: (cacheUserId ?? currentPersonalProfileUserId)(),
      workspaces: context.watch<WorkspaceCubit>(),
    );
    if (userId == null ||
        (cacheUserId ?? currentPersonalProfileUserId)() != userId ||
        workspace == null) {
      return Center(child: Text(context.l10n.homePersonalAgendaUnavailable));
    }
    // Recreate on account or membership changes; never reuse another scope's
    // visible events, and never fall back to a shared workspace.
    return PersonalAgendaScope(
      key: ValueKey('personal-agenda:$userId:${workspace.id}'),
      userId: userId,
      workspaceId: workspace.id,
      settings: context.read<TimezoneSettingsCubit>(),
      repository: repository,
      child: PersonalAgendaView(
        workspaceId: workspace.id,
        replayToken: replayToken,
      ),
    );
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

  Widget? _status(CalendarState state) {
    if (state.error == null && !(state.isRefreshing && state.hasLoadedOnce)) {
      return null;
    }
    return Column(
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
      ],
    );
  }

  @override
  Widget build(BuildContext context) =>
      BlocBuilder<CalendarCubit, CalendarState>(
        builder: (context, state) {
          if (!state.hasLoadedOnce && state.error == null) {
            return const Center(child: NovaLoadingIndicator());
          }
          final status = _status(state);
          return RefreshIndicator(
            onRefresh: _refresh,
            child: state.events.isEmpty
                ? ListView(
                    padding: EdgeInsets.only(
                      top: floatingShellHeaderInset(context),
                      bottom: MediaQuery.paddingOf(context).bottom,
                    ),
                    physics: const AlwaysScrollableScrollPhysics(),
                    children: [
                      if (status != null) status,
                      if (state.error == null)
                        Padding(
                          padding: const EdgeInsets.all(32),
                          child: Text(context.l10n.calendarAgendaEmpty),
                        ),
                    ],
                  )
                : AgendaView(
                    contentTopPadding: floatingShellHeaderInset(context),
                    scrollHeader: status,
                    selectedDate: state.effectiveSelectedDate,
                    events: state.displayEvents,
                    isLoadingMore: state.isLoadingMore,
                    onLoadMore: () => context
                        .read<CalendarCubit>()
                        .loadMoreForward(widget.workspaceId),
                    onDaySelected: context.read<CalendarCubit>().selectDate,
                    // Home never mutates the global workspace.
                    onEventTap: (event) => unawaited(
                      showEventDetailSheet(
                        context,
                        event: event,
                        readOnly: true,
                      ),
                    ),
                  ),
          );
        },
      );
}
