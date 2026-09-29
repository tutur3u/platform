import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/education/cubit/education_access_cubit.dart';
import 'package:mobile/features/habits/cubit/habits_access_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';

bool shouldRedirectPersonalTimerRequests(
  String matchedLocation,
  WorkspaceState workspaceState,
) =>
    matchedLocation == Routes.timerRequests &&
    (workspaceState.currentWorkspace?.personal ?? false);

bool shouldRedirectDisabledHabitsRoutes(
  String matchedLocation,
  HabitsAccessState habitsAccessState,
) =>
    Routes.miniAppRootForLocation(matchedLocation) == Routes.habits &&
    (habitsAccessState.status != HabitsAccessStatus.loaded ||
        !habitsAccessState.enabled);

bool shouldRedirectDisabledEducationRoutes(
  String matchedLocation,
  EducationAccessState educationAccessState,
) =>
    Routes.miniAppRootForLocation(matchedLocation) == Routes.education &&
    (educationAccessState.status != EducationAccessStatus.loaded ||
        !educationAccessState.enabled);
