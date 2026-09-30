import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/widgets/shadcn_material_bridge.dart';
import 'package:mobile/data/models/calendar_event.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/calendar_repository.dart';
import 'package:mobile/features/calendar/cubit/calendar_cubit.dart';
import 'package:mobile/features/calendar/view/calendar_page.dart';
import 'package:mobile/features/settings/cubit/calendar_settings_cubit.dart';
import 'package:mobile/features/settings/cubit/timezone_settings_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class _Workspace extends Mock implements WorkspaceCubit {}

class _Timezone extends Mock implements TimezoneSettingsCubit {}

class _Repository extends Mock implements CalendarRepository {}

void main() {
  setUpAll(() async {
    registerFallbackValue(DateTime.utc(2026));
    await CacheStore.instance.clearScope();
  });
  for (final failedRange in [false, true]) {
    final rangeState = failedRange ? 'failed' : 'pending';
    testWidgets(
      'deep-link edit preserves raw instants with $rangeState range',
      (tester) async {
        CalendarCubit.clearCache();
        final range = Completer<List<CalendarEvent>>();
        final repository = _Repository();
        final event = CalendarEvent.fromJson(const {
          'id': 'fixture-event',
          'title': 'Synthetic meeting',
          'start_at': '2026-10-05T02:00:00Z',
          'end_at': '2026-10-05T11:00:00Z',
        });
        when(
          () => repository.getEvents(
            'fixture-ws',
            start: any(named: 'start'),
            end: any(named: 'end'),
          ),
        ).thenAnswer((_) => range.future);
        when(
          () => repository.getEventById('fixture-ws', 'fixture-event'),
        ).thenAnswer((_) async => event);
        Map<String, dynamic>? written;
        when(
          () => repository.updateEvent('fixture-ws', 'fixture-event', any()),
        ).thenAnswer((invocation) async {
          written = Map<String, dynamic>.from(
            invocation.positionalArguments[2] as Map,
          );
        });
        final workspace = _Workspace();
        when(() => workspace.state).thenReturn(
          const WorkspaceState(
            currentWorkspace: Workspace(
              id: 'fixture-ws',
              name: 'Synthetic workspace',
            ),
          ),
        );
        when(() => workspace.stream).thenAnswer((_) => const Stream.empty());
        final timezone = _Timezone();
        when(() => timezone.state).thenReturn(
          const TimezoneSettingsState(
            personal: 'Asia/Ho_Chi_Minh',
            loading: false,
            resolved: true,
          ),
        );
        when(() => timezone.stream).thenAnswer((_) => const Stream.empty());
        when(
          () => timezone.load(
            userId: any(named: 'userId'),
            workspaceId: any(named: 'workspaceId'),
          ),
        ).thenAnswer((_) async {});
        final settings = CalendarSettingsCubit();
        addTearDown(settings.close);
        final router = GoRouter(
          initialLocation: '/test',
          routes: [
            GoRoute(
              path: '/calendar',
              builder: (_, _) => const SizedBox.shrink(),
            ),
            GoRoute(
              path: '/test',
              builder: (_, _) => shad.DrawerOverlay(
                child: MultiBlocProvider(
                  providers: [
                    BlocProvider<WorkspaceCubit>.value(value: workspace),
                    BlocProvider<TimezoneSettingsCubit>.value(value: timezone),
                    BlocProvider<CalendarSettingsCubit>.value(value: settings),
                  ],
                  child: CalendarPage(
                    initialEventId: 'fixture-event',
                    repositoryFactory: () => repository,
                  ),
                ),
              ),
            ),
          ],
        );
        addTearDown(router.dispose);
        await tester.pumpWidget(
          shad.ShadcnApp.router(
            theme: const shad.ThemeData(
              colorScheme: shad.ColorSchemes.lightZinc,
            ),
            localizationsDelegates: const [
              ...AppLocalizations.localizationsDelegates,
              shad.ShadcnLocalizations.delegate,
            ],
            supportedLocales: AppLocalizations.supportedLocales,
            routerConfig: router,
            builder: ShadcnMaterialBridge.appBuilder,
          ),
        );
        // Range requests deliberately remain incomplete while details open.
        await tester.pump();
        await tester.pump(const Duration(seconds: 1));
        if (failedRange) {
          range.completeError(Exception('Synthetic range failure'));
          await tester.pump();
        }
        await tester.tap(find.text('Edit event'));
        await tester.pump(const Duration(seconds: 1));
        await tester.enterText(
          find.byType(TextField).first,
          'Renamed synthetic meeting',
        );
        tester.testTextInput.hide();
        await tester.pump();
        await tester.tap(find.text('Save'));
        await tester.pump(const Duration(seconds: 1));
        expect(written?['title'], 'Renamed synthetic meeting');
        expect(DateTime.parse(written!['start_at'] as String), event.startAt);
        expect(DateTime.parse(written!['end_at'] as String), event.endAt);
        if (!range.isCompleted) range.complete(const []);
        await tester.pumpAndSettle();
        verifyNever(
          () => timezone.load(
            userId: any(named: 'userId'),
            workspaceId: any(named: 'workspaceId'),
          ),
        );
        expect(tester.takeException(), isNull);
      },
      timeout: const Timeout(Duration(seconds: 30)),
    );
  }
}
