import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/classes/cubit/classes_today_cubit.dart';
import 'package:mobile/features/classes/data/class_session.dart';
import 'package:mobile/features/classes/data/classes_today_repository.dart';
import 'package:mobile/l10n/l10n.dart';

/// Education Home: the day's class sessions, next one first. States are
/// words from real data; there are no count chips.
class ClassesTodayCard extends StatelessWidget {
  const ClassesTodayCard({super.key});

  static const double _timeWidth = 52;
  static const double dividerInset =
      AppLayout.rowHorizontalPadding + _timeWidth + AppLayout.rowLeadingGap;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return BlocBuilder<ClassesTodayCubit, ClassesTodayState>(
      builder: (context, state) {
        if (state.access == ClassesTodayAccess.denied) {
          return const SizedBox.shrink();
        }
        final cubit = context.read<ClassesTodayCubit>();
        final sessions = cubit.orderedSessions();
        final now = cubit.now;
        final List<Widget> rows;
        if (state.snapshot == null &&
            state.status != ClassesTodayStatus.error) {
          rows = const [AppSkeletonRows()];
        } else if (state.snapshot == null) {
          rows = [
            AppStateMessage.inline(
              icon: LucideIcons.cloudOff,
              tone: AppTone.destructive,
              title: l10n.commonSomethingWentWrong,
              message: l10n.homeSectionLoadFailed,
            ),
          ];
        } else if (sessions.isEmpty) {
          rows = [
            AppStateMessage.inline(
              icon: LucideIcons.calendarCheck,
              title: l10n.classesTodayEmpty,
            ),
          ];
        } else {
          rows = [
            for (final session in sessions)
              _SessionRow(session: session, phase: session.phaseAt(now)),
          ];
        }
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          mainAxisSize: MainAxisSize.min,
          children: [
            AppSectionCaption(
              // Never claim "mine" while the source cannot filter by role.
              state.effectiveScope == ClassScope.mine
                  ? l10n.classesTodayTitle
                  : l10n.classesTodayAllTitle,
              trailing: state.scopeSupported
                  ? AppButton.ghost(
                      size: AppButtonSize.small,
                      onPressed: () => unawaited(
                        cubit.setScope(
                          state.scope == ClassScope.mine
                              ? ClassScope.all
                              : ClassScope.mine,
                        ),
                      ),
                      child: Text(
                        state.scope == ClassScope.mine
                            ? l10n.classesTodayShowAll
                            : l10n.classesTodayShowMine,
                      ),
                    )
                  : null,
            ),
            const SizedBox(height: AppSpacing.xs),
            AppGroupedCard(dividerInset: dividerInset, children: rows),
          ],
        );
      },
    );
  }
}

class _SessionRow extends StatelessWidget {
  const _SessionRow({required this.session, required this.phase});

  final ClassSession session;
  final ClassSessionPhase phase;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    final l10n = context.l10n;
    final locale = Localizations.localeOf(context).toLanguageTag();
    final time = DateFormat.Hm(locale);
    final done = phase == ClassSessionPhase.done;
    final title = session.groupName ?? session.title ?? l10n.classesUntitled;
    final detail = [
      if (session.groupName != null && session.title != null) session.title!,
      if (phase == ClassSessionPhase.inProgress) l10n.classesInProgress,
      if (done) l10n.classesDone,
    ].join(' · ');
    final figures = tokens.typography.small.copyWith(
      fontFeatures: const [FontFeature.tabularFigures()],
      color: done ? c.mutedForeground : c.foreground,
    );
    return AppGroupedRow(
      semanticLabel: [
        title,
        '${time.format(session.startsAt)}–${time.format(session.endsAt)}',
        if (detail.isNotEmpty) detail,
      ].join(', '),
      leading: ExcludeSemantics(
        child: SizedBox(
          width: ClassesTodayCard._timeWidth,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                time.format(session.startsAt),
                style: figures.copyWith(fontWeight: FontWeight.w600),
              ),
              Text(
                time.format(session.endsAt),
                style: figures.copyWith(color: c.mutedForeground),
              ),
            ],
          ),
        ),
      ),
      title: Text(
        title,
        maxLines: 2,
        overflow: TextOverflow.ellipsis,
        style: done ? TextStyle(color: c.mutedForeground) : null,
      ),
      subtitle: detail.isEmpty
          ? null
          : Text(detail, maxLines: 1, overflow: TextOverflow.ellipsis),
    );
  }
}
