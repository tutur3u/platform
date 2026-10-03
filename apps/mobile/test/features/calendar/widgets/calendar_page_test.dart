import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/calendar/cubit/calendar_cubit.dart';
import 'package:mobile/features/calendar/view/calendar_page.dart';
import 'package:mobile/features/calendar/widgets/three_day_view.dart';
import 'package:mobile/features/calendar/widgets/week_view.dart';
import 'package:mobile/features/settings/cubit/calendar_settings_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mocktail/mocktail.dart';

import '../../../helpers/helpers.dart';

class _Workspace extends Mock implements WorkspaceCubit {}

void main() {
  for (final size in [const Size(390, 844), const Size(768, 1024)]) {
    testWidgets('Calendar page opens at $size without provider errors', (
      tester,
    ) async {
      tester.view
        ..physicalSize = size
        ..devicePixelRatio = 1;
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });
      final workspace = _Workspace();
      when(() => workspace.state).thenReturn(const WorkspaceState());
      when(() => workspace.stream).thenAnswer((_) => const Stream.empty());
      final chrome = ShellChromeActionsCubit();
      addTearDown(chrome.close);
      final settings = CalendarSettingsCubit();
      addTearDown(settings.close);
      await tester.pumpApp(
        MultiBlocProvider(
          providers: [
            BlocProvider<ShellChromeActionsCubit>.value(value: chrome),
            BlocProvider<WorkspaceCubit>.value(value: workspace),
            BlocProvider<CalendarSettingsCubit>.value(value: settings),
          ],
          child: const CalendarPage(),
        ),
      );
      await tester.pump();
      expect(tester.takeException(), isNull);
      final calendarContext = tester.element(
        find.byType(ThreeDayView).evaluate().isNotEmpty
            ? find.byType(ThreeDayView)
            : find.byType(WeekView),
      );
      final cubit = calendarContext.read<CalendarCubit>();
      await cubit.setViewMode(CalendarViewMode.agenda);
      await tester.pump();
      expect(cubit.state.viewMode, CalendarViewMode.agenda);
      chrome.state.resetSectionForLocation(Routes.calendar)!();
      await tester.pump();
      expect(
        cubit.state.viewMode,
        size.width >= 600 ? CalendarViewMode.week : CalendarViewMode.threeDays,
      );
      expect(
        find.byType(size.width >= 600 ? WeekView : ThreeDayView),
        findsOneWidget,
      );
    });
  }
}
