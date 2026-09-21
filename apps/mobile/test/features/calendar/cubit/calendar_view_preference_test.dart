import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/data/repositories/calendar_repository.dart';
import 'package:mobile/features/calendar/cubit/calendar_cubit.dart';
import 'package:mocktail/mocktail.dart';

class _Repository extends Mock implements CalendarRepository {}

void main() {
  setUpAll(() {
    registerFallbackValue(DateTime(2026));
    FlutterSecureStorage.setMockInitialValues({});
  });
  setUp(() async {
    CalendarCubit.clearCache();
    await CacheStore.instance.clearScope();
  });

  test('automatic view adapts but explicit agenda survives resize', () async {
    final cubit = CalendarCubit(
      calendarRepository: _Repository(),
      defaultViewMode: CalendarViewMode.week,
    );
    addTearDown(cubit.close);
    expect(cubit.state.viewMode, CalendarViewMode.week);
    cubit.updateDefaultView(CalendarViewMode.threeDays);
    expect(cubit.state.viewMode, CalendarViewMode.threeDays);
    await cubit.setViewMode(CalendarViewMode.agenda);
    cubit.updateDefaultView(CalendarViewMode.week);
    expect(cubit.state.viewMode, CalendarViewMode.agenda);
  });

  test('prewarmed agenda does not replace tablet week default', () async {
    final repo = _Repository();
    when(
      () => repo.getEvents(
        any(),
        start: any(named: 'start'),
        end: any(named: 'end'),
      ),
    ).thenAnswer((_) async => []);
    await CalendarCubit.prewarm(calendarRepository: repo, wsId: 'workspace');
    final cubit = CalendarCubit(
      calendarRepository: repo,
      defaultViewMode: CalendarViewMode.week,
    );
    addTearDown(cubit.close);
    await cubit.loadEvents('workspace');
    expect(cubit.state.viewMode, CalendarViewMode.week);
  });

  test('explicit view survives disk-only reopen', () async {
    final repo = _Repository();
    when(
      () => repo.getEvents(
        any(),
        start: any(named: 'start'),
        end: any(named: 'end'),
      ),
    ).thenAnswer((_) async => []);
    final first = CalendarCubit(calendarRepository: repo);
    await first.loadEvents('workspace');
    await first.setViewMode(CalendarViewMode.month);
    await first.close();
    CalendarCubit.clearCache();
    await CacheStore.instance.closeForTesting();
    await CacheStore.instance.init();
    await CalendarCubit.prewarm(
      calendarRepository: repo,
      wsId: 'workspace',
      forceRefresh: true,
    );
    final cubit = CalendarCubit(
      calendarRepository: repo,
      defaultViewMode: CalendarViewMode.week,
    );
    addTearDown(cubit.close);
    await cubit.loadEvents('workspace', forceRefresh: true);
    expect(cubit.state.viewMode, CalendarViewMode.month);
  });
  test(
    'workspace switch restores its own selection or responsive default',
    () async {
      final repo = _Repository();
      when(
        () => repo.getEvents(
          any(),
          start: any(named: 'start'),
          end: any(named: 'end'),
        ),
      ).thenAnswer((_) async => []);
      final cubit = CalendarCubit(
        calendarRepository: repo,
        defaultViewMode: CalendarViewMode.week,
      );
      addTearDown(cubit.close);
      await cubit.loadEvents('a');
      await cubit.setViewMode(CalendarViewMode.month);
      await cubit.loadEvents('b');
      expect(cubit.state.viewMode, CalendarViewMode.week);
      expect(cubit.state.hasSelectedView, isFalse);
      await cubit.setViewMode(CalendarViewMode.agenda);
      await cubit.loadEvents('a');
      expect(cubit.state.viewMode, CalendarViewMode.month);
      await cubit.loadEvents('b');
      expect(cubit.state.viewMode, CalendarViewMode.agenda);
    },
  );
}
