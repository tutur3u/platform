import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/data/repositories/calendar_repository.dart';
import 'package:mobile/features/calendar/cubit/calendar_cubit.dart';
import 'package:mobile/features/calendar/utils/timeline_zoom.dart';
import 'package:mocktail/mocktail.dart';

class _Repository extends Mock implements CalendarRepository {}

void main() {
  late _Repository repository;
  setUpAll(() {
    registerFallbackValue(DateTime(2030));
    FlutterSecureStorage.setMockInitialValues({});
  });
  setUp(() async {
    CalendarCubit.clearCache();
    await CacheStore.instance.clearScope();
    repository = _Repository();
    when(
      () => repository.getEvents(
        any(),
        start: any(named: 'start'),
        end: any(named: 'end'),
      ),
    ).thenAnswer((_) async => []);
  });
  Future<void> zoom(CalendarCubit cubit, double value, String ws) =>
      cubit.setTimelineZoom(
        value,
        expectedUserId: null,
        expectedWorkspaceId: ws,
        expectedScope: cubit.timelineZoomScope,
      );
  test('zoom defaults and clamp never store invalid geometry', () {
    expect(const CalendarState().timelineZoom, 1);
    expect(calendarTimelineZoom(null), 1);
    expect(calendarTimelineZoom(double.nan), 1);
    expect(calendarTimelineZoom(double.infinity), 1);
    expect(calendarTimelineZoom(0), 0.65);
    expect(calendarTimelineZoom(100), 2.5);
    expect(
      const CalendarState().copyWith(timelineZoom: 1.5),
      isNot(const CalendarState()),
    );
  });
  test(
    'completed zoom survives disk-only reopen and view/date changes',
    () async {
      final first = CalendarCubit(calendarRepository: repository);
      await first.loadEvents('a');
      await zoom(first, 1.5, 'a');
      await first.setViewMode(CalendarViewMode.week);
      first.selectDate(DateTime(2030, 3, 8));
      expect(first.state.timelineZoom, 1.5);
      await first.close();
      CalendarCubit.clearCache();
      await CacheStore.instance.closeForTesting();
      await CacheStore.instance.init();
      final reopened = CalendarCubit(calendarRepository: repository);
      addTearDown(reopened.close);
      await reopened.loadEvents('a', forceRefresh: true);
      expect(reopened.state.timelineZoom, 1.5);
      expect(reopened.state.viewMode, CalendarViewMode.week);
    },
  );
  test(
    'workspace zoom survives while stale ABA completion is denied',
    () async {
      final cubit = CalendarCubit(calendarRepository: repository);
      addTearDown(cubit.close);
      await cubit.loadEvents('a');
      final oldVersion = cubit.timelineZoomScope;
      await zoom(cubit, 1.4, 'a');
      await cubit.loadEvents('b');
      expect(cubit.state.timelineZoom, 1);
      await zoom(cubit, 2, 'b');
      await cubit.loadEvents('a');
      expect(cubit.state.timelineZoom, 1.4);
      await cubit.setTimelineZoom(
        2.4,
        expectedUserId: null,
        expectedWorkspaceId: 'a',
        expectedScope: oldVersion,
      );
      expect(cubit.state.timelineZoom, 1.4);
      await cubit.setTimelineZoom(
        2.4,
        expectedUserId: 'another-actor',
        expectedWorkspaceId: 'a',
        expectedScope: cubit.timelineZoomScope,
      );
      expect(cubit.state.timelineZoom, 1.4);
      await cubit.loadEvents('b');
      expect(cubit.state.timelineZoom, 2);
    },
  );
  test(
    'same-scope refresh keeps controls valid but logout epoch revokes them',
    () async {
      final cubit = CalendarCubit(calendarRepository: repository);
      addTearDown(cubit.close);
      await cubit.loadEvents('a');
      final scope = cubit.timelineZoomScope;
      await cubit.loadEvents('a', forceRefresh: true);
      await cubit.setTimelineZoom(
        1.6,
        expectedUserId: null,
        expectedWorkspaceId: 'a',
        expectedScope: scope,
      );
      expect(cubit.state.timelineZoom, 1.6);
      CalendarCubit.clearCache();
      await cubit.setTimelineZoom(
        2.4,
        expectedUserId: null,
        expectedWorkspaceId: 'a',
        expectedScope: scope,
      );
      expect(cubit.state.timelineZoom, 1.6);
    },
  );
  test(
    'prewarm preserves completed zoom rather than resetting preference',
    () async {
      final first = CalendarCubit(calendarRepository: repository);
      await first.loadEvents('a');
      await zoom(first, 1.8, 'a');
      await first.close();
      await CalendarCubit.prewarm(
        calendarRepository: repository,
        wsId: 'a',
        forceRefresh: true,
      );
      final reopened = CalendarCubit(calendarRepository: repository);
      addTearDown(reopened.close);
      await reopened.loadEvents('a', forceRefresh: true);
      expect(reopened.state.timelineZoom, 1.8);
    },
  );
}
