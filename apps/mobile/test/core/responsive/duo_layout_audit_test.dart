import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/responsive/adaptive_sheet.dart';
import 'package:mobile/data/models/calendar_event.dart';
import 'package:mobile/features/auth/widgets/auth_scaffold.dart';
import 'package:mobile/features/calendar/widgets/agenda_view.dart';
import 'package:mobile/features/habits/cubit/habits_state.dart';
import 'package:mobile/features/habits/widgets/habit_tracker_detail_sheet.dart';
import 'package:mobile/features/time_tracker/cubit/time_tracker_state.dart';
import 'package:mobile/features/time_tracker/widgets/history_period_selector_sheet.dart';

import '../../helpers/pump_app.dart';

/// Foldable (iPhone Duo) physical @3x pixel specs mapped to logical dp:
/// - Cover portrait:   1398×2034 px -> 466×678 dp
/// - Cover landscape:  2034×1398 px -> 678×466 dp
/// - Inner portrait:   2007×2853 px -> 669×951 dp
/// - Inner landscape:  2853×2007 px -> 951×669 dp
const _duoGeometries = <(String, Size)>[
  ('cover_portrait_466x678', Size(466, 678)),
  ('cover_landscape_678x466', Size(678, 466)),
  ('inner_portrait_669x951', Size(669, 951)),
  ('inner_landscape_951x669', Size(951, 669)),
];

Widget _duoHarness({
  required Size size,
  required Widget child,
  double keyboardInset = 0,
  double textScale = 1.0,
}) {
  return sorbetTestApp(
    home: Builder(
      builder: (context) => MediaQuery(
        data: MediaQuery.of(context).copyWith(
          size: size,
          devicePixelRatio: 3,
          viewInsets: EdgeInsets.only(bottom: keyboardInset),
          textScaler: TextScaler.linear(textScale),
        ),
        child: Material(child: child),
      ),
    ),
  );
}

void main() {
  group('Foldable Duo layout audit', () {
    for (final (label, size) in _duoGeometries) {
      testWidgets('AuthScaffold + AuthHeroBand renders cleanly on $label', (
        tester,
      ) async {
        tester.view.devicePixelRatio = 3;
        tester.view.physicalSize = Size(size.width * 3, size.height * 3);
        addTearDown(() {
          tester.view.resetPhysicalSize();
          tester.view.resetDevicePixelRatio();
        });

        await tester.pumpWidget(
          _duoHarness(
            size: size,
            keyboardInset: size.height < 500 ? 220 : 0,
            textScale: 1.3,
            child: AuthScaffold(
              hero: const AuthHeroBand(),
              title: 'Sign in to Tuturuuu',
              subtitle: const Text('Work across your phone, tablet, and watch'),
              bottomAction: FilledButton(
                onPressed: () {},
                child: const Text('Continue'),
              ),
              child: const Column(
                children: [
                  TextField(decoration: InputDecoration(hintText: 'Email')),
                  SizedBox(height: 12),
                  TextField(decoration: InputDecoration(hintText: 'Password')),
                ],
              ),
            ),
          ),
        );
        await tester.pump();
        expect(tester.takeException(), isNull);
      });

      testWidgets(
        'HistoryPeriodSelectorSheet day/week/month fit without overflow on $label',
        (tester) async {
          tester.view.devicePixelRatio = 3;
          tester.view.physicalSize = Size(size.width * 3, size.height * 3);
          addTearDown(() {
            tester.view.resetPhysicalSize();
            tester.view.resetDevicePixelRatio();
          });

          for (final mode in [
            HistoryViewMode.day,
            HistoryViewMode.week,
            HistoryViewMode.month,
          ]) {
            await tester.pumpWidget(
              _duoHarness(
                size: size,
                child: Center(
                  child: HistoryPeriodSelectorSheet(
                    viewMode: mode,
                    initialAnchorDate: DateTime(2026, 11, 27),
                    firstDayOfWeek: DateTime.monday,
                  ),
                ),
              ),
            );
            await tester.pump();
            expect(tester.takeException(), isNull);
          }
        },
      );

      testWidgets(
        'showAdaptiveSheet stays bounded on $label with keyboard open',
        (tester) async {
          tester.view.devicePixelRatio = 3;
          tester.view.physicalSize = Size(size.width * 3, size.height * 3);
          addTearDown(() {
            tester.view.resetPhysicalSize();
            tester.view.resetDevicePixelRatio();
          });

          await tester.pumpWidget(
            _duoHarness(
              size: size,
              keyboardInset: 220,
              child: Builder(
                builder: (context) => Center(
                  child: FilledButton(
                    onPressed: () => showAdaptiveSheet<void>(
                      context: context,
                      builder: (_) => HabitTrackerDetailSheet(
                        detailStatus: HabitsStatus.loading,
                        detailError: null,
                        isDetailRefreshing: false,
                        isSubmittingEntry: false,
                        isSubmittingStreakAction: false,
                        isArchivingTracker: false,
                        onRetry: () async {},
                        onLogEntry: () async {},
                        onEditTracker: () async {},
                        onDeleteEntry: (_) async {},
                        onApplyStreakAction: (_) async {},
                        onArchiveTracker: () async {},
                      ),
                    ),
                    child: const Text('Open sheet'),
                  ),
                ),
              ),
            ),
          );

          await tester.tap(find.text('Open sheet'));
          await tester.pumpAndSettle();
          expect(tester.takeException(), isNull);
        },
      );

      testWidgets('AgendaView adapts cleanly on $label', (tester) async {
        tester.view.devicePixelRatio = 3;
        tester.view.physicalSize = Size(size.width * 3, size.height * 3);
        addTearDown(() {
          tester.view.resetPhysicalSize();
          tester.view.resetDevicePixelRatio();
        });

        final now = DateTime(2026, 11, 27, 10);
        final events = [
          CalendarEvent(
            id: 'e1',
            title: 'Foldable layout review',
            startAt: now,
            endAt: now.add(const Duration(hours: 1)),
            color: 'BLUE',
          ),
          CalendarEvent(
            id: 'e2',
            title: 'Watch companion release sync',
            startAt: now.add(const Duration(hours: 2)),
            endAt: now.add(const Duration(hours: 3)),
            color: 'PURPLE',
          ),
        ];

        await tester.pumpWidget(
          _duoHarness(
            size: size,
            textScale: 1.3,
            child: AgendaView(
              events: events,
              selectedDate: now,
              onEventTap: (_) {},
              onDaySelected: (_) {},
            ),
          ),
        );
        await tester.pump();
        expect(tester.takeException(), isNull);
      });
    }

    testWidgets('Fold/unfold transitions preserve layout without exceptions', (
      tester,
    ) async {
      tester.view.devicePixelRatio = 3;
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });

      final sequence = <Size>[
        const Size(466, 678), // Cover portrait
        const Size(669, 951), // Unfold to inner portrait
        const Size(951, 669), // Rotate unfolded to landscape
        const Size(678, 466), // Fold to cover landscape
        const Size(466, 678), // Rotate back to cover portrait
      ];

      for (final size in sequence) {
        tester.view.physicalSize = Size(size.width * 3, size.height * 3);
        await tester.pumpWidget(
          _duoHarness(
            size: size,
            keyboardInset: size.height < 500 ? 200 : 0,
            child: const AuthScaffold(
              hero: AuthHeroBand(),
              title: 'Tuturuuu',
              child: TextField(
                decoration: InputDecoration(hintText: 'Workspace email'),
              ),
            ),
          ),
        );
        await tester.pump();
        expect(tester.takeException(), isNull);
      }
    });
  });
}
