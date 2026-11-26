import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/data/models/calendar_event.dart';
import 'package:mobile/data/models/calendar_recurrence.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/calendar_repository.dart';
import 'package:mobile/data/repositories/calendar_series_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/calendar/cubit/calendar_cubit.dart';
import 'package:mobile/features/calendar/utils/calendar_date_time.dart';
import 'package:mobile/features/calendar/utils/calendar_recurrence_draft.dart';
import 'package:mobile/features/calendar/view/calendar_page.dart';
import 'package:mobile/features/settings/cubit/calendar_settings_cubit.dart';
import 'package:mobile/features/settings/cubit/timezone_settings_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mocktail/mocktail.dart';

import '../../../helpers/helpers.dart';

class _Workspace extends Mock implements WorkspaceCubit {}

class _Timezone extends Mock implements TimezoneSettingsCubit {}

class _Repository extends Mock implements CalendarRepository {}

class _NoApi extends Fake implements ApiClient {
  @override
  void dispose() {}
}

const zone = 'Asia/Ho_Chi_Minh';
const seriesId = '6f1f6b2e-8a52-4d47-9b0e-3f4c2a1d9e7b';
final weekly = CalendarRecurrenceRule(
  frequency: CalendarRecurrenceFrequency.weekly,
  timeZone: zone,
  weekdays: [calendarRecurrenceWeekdays[calendarNow(zone).weekday - 1]],
);

typedef _Mutation = ({
  bool delete,
  int expectedRevision,
  CalendarRecurrenceScope scope,
  Map<String, dynamic>? event,
  CalendarRecurrenceRule? rule,
  CalendarRecurrenceAnchor? anchor,
});

class _Series extends CalendarSeriesRepository {
  _Series(this.occurrence) : super(apiClient: _NoApi());

  final CalendarSeriesOccurrence occurrence;
  final mutations = <_Mutation>[];
  Exception? mutateError;

  @override
  Future<List<CalendarSeriesOccurrence>> listOccurrences(
    String wsId, {
    required DateTime from,
    required DateTime to,
  }) async => [occurrence];

  @override
  /// The series began two weeks before the shown occurrence.
  @override
  Future<NativeCalendarSeries> getSeries(String wsId, String seriesId) async {
    final first = recurrenceLocalWall(
      occurrence.originalStartLocal,
    ).subtract(const Duration(days: 14));
    return NativeCalendarSeries(
      id: seriesId,
      revision: 4,
      rule: weekly,
      anchor: CalendarRecurrenceAnchor(
        startLocal: recurrenceLocalString(first),
        endLocal: recurrenceLocalString(first.add(const Duration(minutes: 30))),
        allDay: false,
      ),
      title: 'Synthetic standup',
    );
  }

  @override
  Future<void> mutateSeries(
    String wsId,
    String seriesId, {
    required bool delete,
    required String requestId,
    required int expectedRevision,
    required CalendarRecurrenceScope scope,
    required String originalStartLocal,
    Map<String, dynamic>? event,
    CalendarRecurrenceRule? rule,
    CalendarRecurrenceAnchor? anchor,
  }) async {
    mutations.add((
      delete: delete,
      expectedRevision: expectedRevision,
      scope: scope,
      event: event,
      rule: rule,
      anchor: anchor,
    ));
    if (mutateError case final error?) throw error;
  }
}

CalendarSeriesOccurrence _occurrence({bool provider = false}) {
  // The timeline opens near the current hour; keep the fixture in view.
  final now = calendarNow(zone);
  final start = calendarDate(now.year, now.month, now.day, now.hour);
  return CalendarSeriesOccurrence(
    event: CalendarEvent(
      id: 'occurrence-today',
      title: 'Synthetic standup',
      startAt: calendarWallToUtc(start, zone),
      endAt: calendarWallToUtc(start.add(const Duration(minutes: 30)), zone),
      provider: 'tuturuuu',
      wsId: 'fixture-ws',
      isAllDayOverride: false,
    ),
    seriesId: seriesId,
    seriesRevision: 3,
    originalStartLocal: recurrenceLocalString(start),
    rule: weekly,
    isProviderSeries: provider,
  );
}

Future<void> _pumpPage(WidgetTester tester, _Series series) async {
  tester.view
    ..physicalSize = const Size(390, 844)
    ..devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  CalendarCubit.clearCache();
  final repository = _Repository();
  when(
    () => repository.getEvents(
      'fixture-ws',
      start: any(named: 'start'),
      end: any(named: 'end'),
    ),
  ).thenAnswer((_) async => const []);
  final workspace = _Workspace();
  when(() => workspace.state).thenReturn(
    const WorkspaceState(
      currentWorkspace: Workspace(id: 'fixture-ws', name: 'Synthetic'),
    ),
  );
  when(() => workspace.stream).thenAnswer((_) => const Stream.empty());
  final timezone = _Timezone();
  when(() => timezone.state).thenReturn(
    const TimezoneSettingsState(personal: zone, loading: false, resolved: true),
  );
  when(() => timezone.stream).thenAnswer((_) => const Stream.empty());
  final settings = CalendarSettingsCubit();
  addTearDown(settings.close);
  await tester.pumpApp(
    MultiBlocProvider(
      providers: [
        BlocProvider<WorkspaceCubit>.value(value: workspace),
        BlocProvider<TimezoneSettingsCubit>.value(value: timezone),
        BlocProvider<CalendarSettingsCubit>.value(value: settings),
      ],
      child: CalendarPage(
        repositoryFactory: () => repository,
        seriesRepositoryFactory: () => series,
      ),
    ),
  );
  await _settle(tester);
}

Future<void> _settle(WidgetTester tester) async {
  for (var i = 0; i < 6; i++) {
    await tester.pump(const Duration(milliseconds: 250));
  }
}

Future<void> _open(WidgetTester tester, String action) async {
  await tester.tap(find.text('Synthetic standup').hitTestable().first);
  await _settle(tester);
  expect(find.text('Weekly'), findsOneWidget);
  if (action == 'edit') {
    await tester.tap(find.byTooltip('Edit event'));
  } else {
    await tester.tap(find.text('Delete event'));
  }
  await _settle(tester);
  expect(find.text('Only this occurrence'), findsOneWidget);
  expect(find.text('This and following occurrences'), findsOneWidget);
  expect(find.text('Entire series'), findsOneWidget);
}

void main() {
  setUpAll(() async {
    registerFallbackValue(DateTime.utc(2026));
    await CacheStore.instance.clearScope();
  });

  testWidgets('edits only one occurrence without its series rule', (
    tester,
  ) async {
    final series = _Series(_occurrence());
    await _pumpPage(tester, series);
    await _open(tester, 'edit');
    await tester.tap(find.text('Only this occurrence'));
    await _settle(tester);
    expect(find.text('Edit recurring event'), findsOneWidget);
    expect(find.text('Repeat'), findsNothing);
    await tester.enterText(find.byType(TextField).first, 'Moved standup');
    tester.testTextInput.hide();
    await tester.pump();
    await tester.tap(find.text('Save'));
    await _settle(tester);
    final mutation = series.mutations.single;
    expect(mutation.delete, isFalse);
    expect(mutation.scope, CalendarRecurrenceScope.occurrence);
    expect(mutation.expectedRevision, 4);
    expect(mutation.rule, isNull);
    expect(mutation.anchor, isNull);
    expect(mutation.event?['title'], 'Moved standup');
    expect(find.text('Edit recurring event'), findsNothing);
  });

  testWidgets('a denied future edit keeps the draft and its notice', (
    tester,
  ) async {
    final series = _Series(_occurrence())
      ..mutateError = const ApiException(message: 'Denied', statusCode: 403);
    await _pumpPage(tester, series);
    await _open(tester, 'edit');
    await tester.tap(find.text('This and following occurrences'));
    await _settle(tester);
    expect(
      find.text(
        'Edits and cancellations for this and following occurrences will '
        'be reset when you save.',
      ),
      findsOneWidget,
    );
    expect(find.text('Repeat'), findsOneWidget);
    await tester.tap(find.text('Save'));
    await _settle(tester);
    expect(series.mutations.single.scope, CalendarRecurrenceScope.future);
    expect(
      find.text("You don't have permission to change events in this calendar."),
      findsOneWidget,
    );
    expect(find.text('Edit recurring event'), findsOneWidget);
  });

  testWidgets('an offline series edit keeps the form open', (tester) async {
    final series = _Series(_occurrence())
      ..mutateError = const ApiException.transport(message: 'Offline');
    await _pumpPage(tester, series);
    await _open(tester, 'edit');
    await tester.tap(find.text('Entire series'));
    await _settle(tester);
    await tester.tap(find.text('Save'));
    await _settle(tester);
    expect(series.mutations.single.scope, CalendarRecurrenceScope.series);
    expect(
      find.text(
        'Connect to the internet to change recurring events. Your draft is '
        'retained.',
      ),
      findsOneWidget,
    );
  });

  testWidgets('deletes the entire series at the revision shown', (
    tester,
  ) async {
    final series = _Series(_occurrence());
    await _pumpPage(tester, series);
    await _open(tester, 'delete');
    await tester.tap(find.text('Entire series'));
    await _settle(tester);
    final mutation = series.mutations.single;
    expect(mutation.delete, isTrue);
    expect(mutation.scope, CalendarRecurrenceScope.series);
    expect(mutation.expectedRevision, 3);
  });

  testWidgets('a delete conflict asks for an explicit reload', (tester) async {
    final series = _Series(_occurrence())
      ..mutateError = const ApiException(message: 'Changed', statusCode: 409);
    await _pumpPage(tester, series);
    await _open(tester, 'delete');
    await tester.tap(find.text('Only this occurrence'));
    await _settle(tester);
    expect(
      find.text('This series changed elsewhere. Reload it before saving.'),
      findsOneWidget,
    );
    expect(find.text('Reload series'), findsOneWidget);
  });

  testWidgets('provider series occurrences stay read-only', (tester) async {
    final series = _Series(_occurrence(provider: true));
    await _pumpPage(tester, series);
    await tester.tap(find.text('Synthetic standup').hitTestable().first);
    await _settle(tester);
    expect(find.byTooltip('Edit event'), findsNothing);
    expect(find.text('Delete event'), findsNothing);
    expect(
      find.textContaining('Manage the series in its original calendar.'),
      findsOneWidget,
    );
  });
}
