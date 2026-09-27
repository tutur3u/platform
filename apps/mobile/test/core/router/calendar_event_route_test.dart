import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/router/app_router.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/apps/cubit/app_tab_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/education/cubit/education_access_cubit.dart';
import 'package:mobile/features/habits/cubit/habits_access_cubit.dart';
import 'package:mobile/features/inventory/cubit/inventory_access_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mocktail/mocktail.dart';

class _AuthCubit extends Mock implements AuthCubit {}

class _WorkspaceCubit extends Mock implements WorkspaceCubit {}

class _HabitsAccessCubit extends Mock implements HabitsAccessCubit {}

class _EducationAccessCubit extends Mock implements EducationAccessCubit {}

class _InventoryAccessCubit extends Mock implements InventoryAccessCubit {}

class _AppTabCubit extends Mock implements AppTabCubit {}

void main() {
  test('calendar event notification location matches the app router', () {
    final auth = _AuthCubit();
    final workspace = _WorkspaceCubit();
    final habits = _HabitsAccessCubit();
    final education = _EducationAccessCubit();
    final inventory = _InventoryAccessCubit();
    final appTab = _AppTabCubit();
    when(() => auth.stream).thenAnswer((_) => const Stream<AuthState>.empty());
    when(() => auth.state).thenReturn(const AuthState.unauthenticated());
    when(
      () => workspace.stream,
    ).thenAnswer((_) => const Stream<WorkspaceState>.empty());
    when(() => workspace.state).thenReturn(const WorkspaceState());
    when(
      () => habits.stream,
    ).thenAnswer((_) => const Stream<HabitsAccessState>.empty());
    when(() => habits.state).thenReturn(const HabitsAccessState());
    when(
      () => education.stream,
    ).thenAnswer((_) => const Stream<EducationAccessState>.empty());
    when(() => education.state).thenReturn(const EducationAccessState());
    when(
      () => inventory.stream,
    ).thenAnswer((_) => const Stream<InventoryAccessState>.empty());
    when(() => inventory.state).thenReturn(const InventoryAccessState());

    final router = createAppRouter(
      auth,
      workspace,
      habits,
      education,
      inventory,
      appTab,
    );
    addTearDown(router.dispose);
    final location = Routes.calendarEventDetailPath('event-123');
    final match = router.configuration.findMatch(Uri.parse(location));
    expect(match.isError, isFalse);
    expect(match.pathParameters['eventId'], 'event-123');
  });
}
