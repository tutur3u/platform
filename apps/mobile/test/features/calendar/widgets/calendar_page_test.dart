import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/calendar/view/calendar_page.dart';
import 'package:mobile/features/calendar/widgets/three_day_view.dart';
import 'package:mobile/features/calendar/widgets/week_view.dart';
import 'package:mobile/features/settings/cubit/calendar_settings_cubit.dart';
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
      final settings = CalendarSettingsCubit();
      addTearDown(settings.close);
      await tester.pumpApp(
        MultiBlocProvider(
          providers: [
            BlocProvider<WorkspaceCubit>.value(value: workspace),
            BlocProvider<CalendarSettingsCubit>.value(value: settings),
          ],
          child: const CalendarPage(),
        ),
      );
      await tester.pump();
      expect(tester.takeException(), isNull);
      expect(
        find.byType(size.width >= 600 ? WeekView : ThreeDayView),
        findsOneWidget,
      );
    });
  }
}
