import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/router/routes.dart';
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

    testWidgets('shows logo and Home title on home', (
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
            body: ShellTopBarTitle(matchedLocation: Routes.home),
          ),
        ),
      );
      await tester.pump();

      expect(find.byType(Image), findsOneWidget);
      expect(find.text('Home'), findsOneWidget);
    });
  });
}
