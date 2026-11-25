import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/layout/layout_tokens.dart';
import 'package:mobile/core/responsive/breakpoints.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/shell/view/mobile_section_app_bar.dart';
import 'package:mobile/features/shell/view/shell_top_bar_title.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mocktail/mocktail.dart';

import '../../../helpers/helpers.dart';

class _MockWorkspaceCubit extends MockCubit<WorkspaceState>
    implements WorkspaceCubit {}

void main() {
  group('ShellTopBarTitle', () {
    late WorkspaceCubit workspaceCubit;

    setUp(() {
      workspaceCubit = _MockWorkspaceCubit();
    });

    testWidgets('shows app picker and Home title on home', (tester) async {
      const state = WorkspaceState(status: WorkspaceStatus.loaded);
      when(() => workspaceCubit.state).thenReturn(state);
      whenListen(
        workspaceCubit,
        const Stream<WorkspaceState>.empty(),
        initialState: state,
      );

      await tester.pumpApp(
        BlocProvider.value(
          value: workspaceCubit,
          child: const Scaffold(
            body: ShellTopBarTitle(matchedLocation: Routes.home),
          ),
        ),
      );
      await tester.pump();

      expect(find.byTooltip('Apps'), findsOneWidget);
      expect(
        tester.widget<Image>(find.byType(Image)).image,
        const AssetImage('assets/logos/transparent.png'),
      );
      expect(find.text('Home'), findsOneWidget);
    });

    testWidgets('beside the rail the title stands alone, without a logo', (
      tester,
    ) async {
      const state = WorkspaceState(status: WorkspaceStatus.loaded);
      when(() => workspaceCubit.state).thenReturn(state);
      whenListen(
        workspaceCubit,
        const Stream<WorkspaceState>.empty(),
        initialState: state,
      );

      await tester.pumpApp(
        BlocProvider.value(
          value: workspaceCubit,
          child: const Scaffold(
            body: ShellTopBarTitle(
              matchedLocation: Routes.home,
              brandInSidebar: true,
            ),
          ),
        ),
      );
      await tester.pump();

      expect(find.byType(Image), findsNothing);
      expect(find.byTooltip('Apps'), findsNothing);
      expect(find.text('Home'), findsOneWidget);
      expect(tester.getTopLeft(find.text('Home')).dx, 0);
    });

    test('the title beside the rail starts at the page gutter', () {
      for (final width in [700.0, 1024.0, 1440.0]) {
        expect(
          shellTopBarPaddingFor(width, besideRail: true).left,
          AppLayout.gutter(Breakpoints.fromWidth(width)),
        );
      }
      expect(shellTopBarPaddingFor(390).left, shellTopBarPadding.left);
    });

    testWidgets('settings title ignores the selected mini app label', (
      tester,
    ) async {
      const state = WorkspaceState(status: WorkspaceStatus.loaded);
      when(() => workspaceCubit.state).thenReturn(state);
      whenListen(
        workspaceCubit,
        const Stream<WorkspaceState>.empty(),
        initialState: state,
      );
      await tester.pumpApp(
        BlocProvider.value(
          value: workspaceCubit,
          child: const Scaffold(
            body: ShellTopBarTitle(
              matchedLocation: Routes.settings,
              fallbackTitle: 'App',
            ),
          ),
        ),
      );
      await tester.pump();
      expect(find.text('Settings'), findsOneWidget);
      expect(find.text('App'), findsNothing);
    });
  });
}
