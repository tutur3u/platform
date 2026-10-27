import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/task_estimate_board.dart';
import 'package:mobile/data/repositories/task_repository.dart';
import 'package:mobile/features/tasks_estimates/cubit/task_estimates_cubit.dart';
import 'package:mobile/features/tasks_estimates/widgets/task_estimate_boards_section.dart';
import 'package:mobile/features/tasks_estimates/widgets/task_estimate_dialog.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mocktail/mocktail.dart';

import '../../helpers/pump_app.dart';

class _WorkspaceCubit extends MockCubit<WorkspaceState>
    implements WorkspaceCubit {}

class _TaskRepository extends Mock implements TaskRepository {}

void main() {
  for (final locale in ['en', 'vi']) {
    for (final type in <String?>['t-shirt', null]) {
      testWidgets('opens $type editor at 2x text in $locale', (tester) async {
        tester.view.physicalSize = const Size(320, 568);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        tester.platformDispatcher.textScaleFactorTestValue = 2;
        addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
        tester.platformDispatcher.localesTestValue = [Locale(locale)];
        addTearDown(tester.platformDispatcher.clearLocalesTestValue);
        final workspace = _WorkspaceCubit();
        when(() => workspace.state).thenReturn(const WorkspaceState());
        final cubit = TaskEstimatesCubit(taskRepository: _TaskRepository());
        addTearDown(workspace.close);
        addTearDown(cubit.close);
        await tester.pumpApp(
          MultiBlocProvider(
            providers: [
              BlocProvider<WorkspaceCubit>.value(value: workspace),
              BlocProvider<TaskEstimatesCubit>.value(value: cubit),
            ],
            child: Scaffold(
              body: TaskEstimateBoardsSection(
                boards: [
                  TaskEstimateBoard(
                    id: 'board-1',
                    name: 'Tasks',
                    createdAt: null,
                    estimationType: type,
                    extendedEstimation: true,
                  ),
                ],
                isUpdating: false,
              ),
            ),
          ),
        );
        await tester.tap(find.text('Tasks'));
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        expect(find.byType(TaskEstimateDialog), findsOneWidget);
        await tester.tap(find.byIcon(Icons.keyboard_arrow_down));
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        final method = find.text('Fibonacci').last;
        await tester.ensureVisible(method);
        await tester.tap(method);
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        final dialogContext = tester.element(find.byType(TaskEstimateDialog));
        final cancel = find.text(dialogContext.l10n.commonCancel);
        await tester.ensureVisible(cancel);
        await tester.tap(cancel);
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        expect(find.byType(TaskEstimateDialog), findsNothing);
      });
    }
  }
}
