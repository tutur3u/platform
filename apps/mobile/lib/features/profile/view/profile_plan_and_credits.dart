import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/config/env.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/assistant/data/assistant_repository.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/calendar/widgets/calendar_connections_sheet.dart';
import 'package:mobile/features/profile/personal_profile_workspace.dart';
import 'package:mobile/features/profile/view/profile_link_row.dart';
import 'package:mobile/features/profile/view/profile_surface.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/widgets/workspace_tier_badge.dart';
import 'package:mobile/l10n/l10n.dart';

class ProfilePlanAndCredits extends StatefulWidget {
  const ProfilePlanAndCredits({
    required this.replayToken,
    this.cacheUserId,
    super.key,
  });

  final int replayToken;
  final String? Function()? cacheUserId;

  @override
  State<ProfilePlanAndCredits> createState() => ProfilePlanAndCreditsState();
}

class ProfilePlanAndCreditsState extends State<ProfilePlanAndCredits> {
  ({String userId, String wsId})? _scope;
  Future<AssistantCredits>? _credits;
  late final AssistantRepository _repository = AssistantRepository();

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final userId = context.watch<AuthCubit>().state.user?.id;
    final workspaces = context.watch<WorkspaceCubit?>();
    final workspace = workspaces == null
        ? null
        : verifiedPersonalProfileWorkspace(
            userId: userId,
            cacheUserId: (widget.cacheUserId ?? currentPersonalProfileUserId)(),
            workspaces: workspaces,
          );
    final scope = userId == null || workspace == null
        ? null
        : (userId: userId, wsId: workspace.id);
    if (scope == _scope) return;
    _scope = scope;
    _credits = scope == null ? null : _load(scope.userId, scope.wsId);
  }

  @override
  void didUpdateWidget(covariant ProfilePlanAndCredits oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.replayToken != oldWidget.replayToken) unawaited(refresh());
  }

  Future<AssistantCredits> _load(String userId, String wsId) =>
      ApiClient.runForUser(
        userId,
        () => _repository.fetchCredits(wsId, forceRefresh: true),
      );

  Future<void> refresh() async {
    final scope = _scope;
    if (scope == null) return;
    final request = _load(scope.userId, scope.wsId);
    setState(() => _credits = request);
    try {
      await request;
    } on Object {
      // The card shows the same request's retryable error.
    }
  }

  @override
  Widget build(BuildContext context) {
    final scope = _scope;
    if (scope == null) return const SizedBox.shrink();
    final l10n = context.l10n;
    final workspace = context.watch<WorkspaceCubit>().state.currentWorkspace;
    final tier = workspace?.tier;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (Env.isCalendarIntegrationsEnabled) ...[
          ProfileCard(
            children: [
              ProfileLinkRow(
                icon: LucideIcons.calendar,
                title: l10n.calendarConnectionsTitle,
                onTap: () {
                  final workspaces = context.read<WorkspaceCubit>();
                  final actor = context.read<AuthCubit>().state.user?.id;
                  final workspace = verifiedPersonalProfileWorkspace(
                    userId: actor,
                    cacheUserId:
                        (widget.cacheUserId ?? currentPersonalProfileUserId)(),
                    workspaces: workspaces,
                  );
                  if (actor == scope.userId && workspace?.id == scope.wsId) {
                    unawaited(
                      showCalendarConnectionsSheet(context, wsId: scope.wsId),
                    );
                  }
                },
              ),
            ],
          ),
          const SizedBox(height: AppLayout.sectionGap),
        ],
        ProfileGroupLabel(l10n.assistantCreditsTitle),
        FutureBuilder<AssistantCredits>(
          key: ValueKey(scope),
          future: _credits,
          builder: (context, snapshot) {
            final credits = snapshot.data;
            return ProfileCard(
              children: [
                if (snapshot.connectionState != ConnectionState.done &&
                    credits == null)
                  const AppSkeletonRows()
                else if (snapshot.hasError ||
                    credits == null ||
                    credits == const AssistantCredits())
                  AppStateMessage.inline(
                    icon: LucideIcons.cloudOff,
                    title: l10n.assistantCreditsUnavailable,
                    actionLabel: l10n.commonRetry,
                    onAction: refresh,
                  )
                else ...[
                  AppGroupedRow(
                    title: Text(l10n.assistantPersonalCredits),
                    subtitle: Text(
                      l10n.assistantCreditsSummary(
                        credits.remaining.floor(),
                        credits.tier,
                      ),
                    ),
                  ),
                  if (credits.totalAllocated > 0)
                    Padding(
                      padding: const EdgeInsets.all(AppSpacing.md),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          LinearProgressIndicator(
                            value: (credits.totalUsed / credits.totalAllocated)
                                .clamp(0.0, 1.0),
                          ),
                          const SizedBox(height: AppSpacing.xs),
                          Text(_usage(context, credits)),
                        ],
                      ),
                    ),
                ],
              ],
            );
          },
        ),
        if (workspace != null && tier != null && tier != workspaceTierFree) ...[
          const SizedBox(height: AppLayout.sectionGap),
          ProfileGroupLabel(l10n.settingsCurrentWorkspace),
          ProfileCard(
            children: [
              AppGroupedRow(
                leading: const Icon(LucideIcons.building2),
                title: Text(workspace.name ?? l10n.settingsNavWorkspace),
                trailing: WorkspaceTierBadge(tier: tier),
                onTap: () => context.push(Routes.settingsWorkspace),
              ),
            ],
          ),
        ],
      ],
    );
  }

  String _usage(BuildContext context, AssistantCredits credits) {
    final locale = Localizations.localeOf(context).toLanguageTag();
    final format = NumberFormat.decimalPattern(locale);
    final periodEnd = credits.periodEnd;
    return [
      '${format.format(credits.totalUsed)} / ${format.format(credits.totalAllocated)}',
      if (periodEnd != null)
        DateFormat.yMMMd(locale).format(periodEnd.toLocal()),
    ].join(' · ');
  }
}
