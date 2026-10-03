import 'package:bloc_test/bloc_test.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/calendar_event.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/features/calendar/cubit/calendar_cubit.dart';
import 'package:mobile/features/dashboard/view/personal_agenda.dart';
import 'package:mocktail/mocktail.dart';

import '../../../helpers/helpers.dart';

class _Calendar extends MockCubit<CalendarState> implements CalendarCubit {}

void main() {
  test(
    'personal agenda selects personal membership without shared fallback',
    () {
      const shared = Workspace(id: 'shared');
      const personal = Workspace(id: 'personal', personal: true);
      expect(homePersonalWorkspace([shared, personal]), personal);
      expect(homePersonalWorkspace([shared]), isNull);
      expect(homePersonalWorkspace([]), isNull);
      // Hidden workspaces still belong to canonical memberships, not a filter.
      expect(homePersonalWorkspace([personal]), personal);
    },
  );

  testWidgets('agenda retains cached events and retries only personal scope', (
    tester,
  ) async {
    final calendar = _Calendar();
    final now = DateTime.now();
    final state = CalendarState(
      status: CalendarStatus.error,
      hasLoadedOnce: true,
      isFromCache: true,
      error: 'Synthetic transport failure',
      selectedDate: now,
      events: [
        CalendarEvent(
          id: 'event',
          title: 'Synthetic personal event',
          startAt: now.add(const Duration(minutes: 30)),
          endAt: now.add(const Duration(hours: 1)),
        ),
      ],
    );
    whenListen(
      calendar,
      const Stream<CalendarState>.empty(),
      initialState: state,
    );
    when(
      () => calendar.loadEvents('personal', forceRefresh: true),
    ).thenAnswer((_) async {});
    when(() => calendar.loadMoreForward('personal')).thenAnswer((_) async {});
    await tester.pumpApp(
      BlocProvider<CalendarCubit>.value(
        value: calendar,
        child: const PersonalAgendaView(
          workspaceId: 'personal',
          replayToken: 0,
        ),
      ),
    );
    await tester.pump(const Duration(milliseconds: 350));
    expect(find.text('Synthetic personal event'), findsOneWidget);
    expect(find.text('Personal calendar is unavailable.'), findsOneWidget);
    await tester.tap(find.text('Retry'));
    await tester.pump();
    verify(() => calendar.loadEvents('personal', forceRefresh: true)).called(1);
    expect(tester.takeException(), isNull);
  });
}
