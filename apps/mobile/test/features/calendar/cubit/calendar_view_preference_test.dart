import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/data/repositories/calendar_repository.dart';
import 'package:mobile/features/calendar/cubit/calendar_cubit.dart';
import 'package:mocktail/mocktail.dart';

class _Repository extends Mock implements CalendarRepository {}

void main() {
  setUpAll(() => registerFallbackValue(DateTime(2026)));
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
    cubit
      ..setViewMode(CalendarViewMode.agenda)
      ..updateDefaultView(CalendarViewMode.week);
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

  test('explicit view survives cached reopen', () async {
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
    first.setViewMode(CalendarViewMode.month);
    await first.close();
    final cubit = CalendarCubit(
      calendarRepository: repo,
      defaultViewMode: CalendarViewMode.week,
    );
    addTearDown(cubit.close);
    await cubit.loadEvents('workspace', forceRefresh: true);
    expect(cubit.state.viewMode, CalendarViewMode.month);
  });
}
