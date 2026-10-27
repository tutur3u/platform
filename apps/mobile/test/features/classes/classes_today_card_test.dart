import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/classes/cubit/classes_today_cubit.dart';
import 'package:mobile/features/classes/data/classes_today_repository.dart';
import 'package:mobile/features/classes/view/classes_today_card.dart';

import '../../helpers/pump_app.dart';
import 'classes_today_fakes.dart';

void main() {
  final now = DateTime(2026, 10, 27, 10);

  Future<ClassesTodayCubit> pumpCard(
    WidgetTester tester,
    FakeClassesTodayRepository repository, {
    double textScale = 1,
  }) async {
    final cubit = ClassesTodayCubit(repository: repository, clock: () => now);
    addTearDown(cubit.close);
    await cubit.load(userId: 'u1', wsId: 'ec');
    await tester.pumpThemedHome(
      MediaQuery(
        data: MediaQueryData(textScaler: TextScaler.linear(textScale)),
        child: Material(
          child: SingleChildScrollView(
            child: BlocProvider.value(
              value: cubit,
              child: const ClassesTodayCard(),
            ),
          ),
        ),
      ),
    );
    await tester.pump();
    return cubit;
  }

  testWidgets('lists sessions next-first with words, not count chips', (
    tester,
  ) async {
    await pumpCard(
      tester,
      FakeClassesTodayRepository(
        snapshot: ClassesTodaySnapshot(
          sessions: [
            session(
              'done',
              start: DateTime(2026, 10, 27, 7),
              groupName: 'Grammar',
            ),
            session(
              'live',
              start: DateTime(2026, 10, 27, 9, 30),
              groupName: 'IELTS A',
              title: 'Room 204',
            ),
            session(
              'later',
              start: DateTime(2026, 10, 27, 14),
              groupName: 'Kids 3',
            ),
          ],
        ),
      ),
    );
    // The source cannot scope to "mine" yet, so the caption does not claim it.
    expect(find.text('All classes today'), findsOneWidget);
    expect(find.text('Show all'), findsNothing);
    expect(find.text('Room 204 · In progress'), findsOneWidget);
    expect(find.text('Done'), findsOneWidget);
    final live = tester.getTopLeft(find.text('IELTS A')).dy;
    final later = tester.getTopLeft(find.text('Kids 3')).dy;
    final done = tester.getTopLeft(find.text('Grammar')).dy;
    expect(live, lessThan(later));
    expect(later, lessThan(done));
    expect(find.byType(AppBadge), findsNothing);
    expect(find.byType(AppChip), findsNothing);
  });

  testWidgets('offers "Show all" once the source can scope to mine', (
    tester,
  ) async {
    final repository = FakeClassesTodayRepository(
      snapshot: const ClassesTodaySnapshot(sessions: [], scopeSupported: true),
    );
    await pumpCard(tester, repository);
    expect(find.text("Today's classes"), findsOneWidget);
    expect(find.text('No classes today'), findsOneWidget);
    await tester.tap(find.text('Show all'));
    await tester.pump();
    expect(find.text('My classes'), findsOneWidget);
    expect(find.text('All classes today'), findsOneWidget);
    expect(repository.fetches.last, endsWith('/all'));
  });

  testWidgets('renders nothing without access', (tester) async {
    await pumpCard(tester, FakeClassesTodayRepository(allowed: false));
    expect(find.text('All classes today'), findsNothing);
    expect(find.byType(ClassesTodayCard), findsOneWidget);
  });

  testWidgets('compact 2x text keeps rows usable', (tester) async {
    tester.view.physicalSize = const Size(320, 568);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await pumpCard(
      tester,
      FakeClassesTodayRepository(
        snapshot: ClassesTodaySnapshot(
          sessions: [
            session(
              'a',
              start: DateTime(2026, 10, 27, 11),
              groupName: 'A very long class name for the advanced IELTS cohort',
              title: 'Room 204, second floor',
            ),
          ],
        ),
      ),
      textScale: 2,
    );
    expect(tester.takeException(), isNull);
  });
}
