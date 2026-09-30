import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/repositories/calendar_repository.dart';
import 'package:mobile/data/repositories/timezone_settings_repository.dart';
import 'package:mobile/features/calendar/cubit/calendar_cubit.dart';
import 'package:mobile/features/calendar/view/calendar_timezone_listener.dart';
import 'package:mobile/features/settings/cubit/timezone_settings_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mocktail/mocktail.dart';

import '../../../helpers/helpers.dart';

class _Workspace extends Mock implements WorkspaceCubit {}

class _Preferences extends TimezoneSettingsRepository {
  Completer<String>? delayed;
  @override
  Future<String> loadPersonal() async => 'auto';
  @override
  Future<String> loadWorkspace(String id) =>
      delayed?.future ?? Future.value('America/New_York');
}

void main() {
  late _Preferences repository;
  late TimezoneSettingsCubit preferences;
  late CalendarRepository events;
  late CalendarCubit calendar;

  setUp(() async {
    repository = _Preferences();
    preferences = TimezoneSettingsCubit(
      repository: repository,
      deviceLoader: () async => 'UTC',
    );
    await preferences.load(userId: 'owner', workspaceId: 'a');
    events = CalendarRepository();
    calendar = CalendarCubit(calendarRepository: events)
      ..setTimezone(preferences.state.effective)
      ..selectDate(DateTime.utc(2026, 1, 10));
  });
  tearDown(() async {
    await preferences.close();
    await calendar.close();
    repository.dispose();
    events.dispose();
  });

  Future<void> mount(WidgetTester tester) async {
    final workspace = _Workspace();
    when(() => workspace.state).thenReturn(const WorkspaceState());
    when(() => workspace.stream).thenAnswer((_) => const Stream.empty());
    await tester.pumpApp(
      MultiBlocProvider(
        providers: [
          BlocProvider<TimezoneSettingsCubit>.value(value: preferences),
          BlocProvider<CalendarCubit>.value(value: calendar),
          BlocProvider<WorkspaceCubit>.value(value: workspace),
        ],
        child: CalendarTimezoneListener(
          child: BlocBuilder<CalendarCubit, CalendarState>(
            builder: (_, state) => Text(state.timezone ?? 'device fallback'),
          ),
        ),
      ),
    );
    expect(find.text('America/New_York'), findsOneWidget);
  }

  for (final accountSwitch in [false, true]) {
    final scope = accountSwitch ? 'account' : 'workspace';
    testWidgets(
      'delayed $scope switch clears mounted Calendar zone before resolving',
      (tester) async {
        await mount(tester);
        repository.delayed = Completer<String>();
        final loading = preferences.load(
          userId: accountSwitch ? 'other' : 'owner',
          workspaceId: accountSwitch ? 'a' : 'b',
        );
        await tester.pump();
        expect(calendar.state.timezone, isNull);
        expect(calendar.state.selectedDate, DateTime.utc(2026, 1, 10));
        expect(find.text('device fallback'), findsOneWidget);
        repository.delayed!.complete('Asia/Tokyo');
        await loading;
        await tester.pumpAndSettle();
        expect(find.text('Asia/Tokyo'), findsOneWidget);
        expect(calendar.state.selectedDate, DateTime.utc(2026, 1, 10));
      },
    );
    testWidgets(
      'failed $scope switch keeps device fallback rather than previous zone',
      (tester) async {
        await mount(tester);
        repository.delayed = Completer<String>();
        final loading = preferences.load(
          userId: accountSwitch ? 'other' : 'owner',
          workspaceId: accountSwitch ? 'a' : 'b',
        );
        await tester.pump();
        repository.delayed!.completeError(Exception('unavailable'));
        await loading;
        await tester.pumpAndSettle();
        expect(preferences.state.failed, isTrue);
        expect(preferences.state.resolved, isFalse);
        expect(calendar.state.timezone, isNull);
        expect(find.text('device fallback'), findsOneWidget);
      },
    );
  }

  testWidgets(
    'same-scope revalidation and failure retain resolved Calendar zone',
    (tester) async {
      await mount(tester);
      repository.delayed = Completer<String>();
      final loading = preferences.load(userId: 'owner', workspaceId: 'a');
      await tester.pump();
      expect(preferences.state.loading, isTrue);
      expect(preferences.state.resolved, isTrue);
      expect(find.text('America/New_York'), findsOneWidget);
      repository.delayed!.completeError(Exception('unavailable'));
      await loading;
      await tester.pumpAndSettle();
      expect(preferences.state.failed, isTrue);
      expect(preferences.state.resolved, isTrue);
      expect(find.text('America/New_York'), findsOneWidget);
    },
  );
}
