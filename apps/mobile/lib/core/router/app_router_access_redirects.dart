import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/cms/cubit/cms_access_cubit.dart';
import 'package:mobile/features/education/cubit/education_access_cubit.dart';
import 'package:mobile/features/habits/cubit/habits_access_cubit.dart';
import 'package:mobile/features/mastermind/access/mastermind_access_state.dart';
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

/// Holds the route while the access check is still running, so a deep link or
/// a push tap neither flashes content nor bounces before the answer arrives.
/// The Fleet view follows its own answer instead (see
/// `shouldRedirectDisabledFleetAccessRoute`).
bool shouldRedirectDisabledMastermindRoutes(
  String matchedLocation,
  MastermindAccessState accessState,
) =>
    Routes.miniAppRootForLocation(matchedLocation) == Routes.mastermind &&
    Routes.normalizeLocation(matchedLocation) != Routes.mastermindFleetAccess &&
    switch (accessState.status) {
      MastermindAccessStatus.initial || MastermindAccessStatus.loading => false,
      MastermindAccessStatus.error => true,
      MastermindAccessStatus.loaded => !accessState.enabled,
    };

/// CMS deep links stay open while access is still resolving (the page shows
/// its loading skeleton) and fall back to Apps once the workspace is known to
/// have no CMS, so the unavailable-studio error is never a resting state.
bool shouldRedirectUnavailableCmsRoutes(
  String matchedLocation,
  CmsAccessState? cmsAccessState,
) =>
    cmsAccessState != null &&
    cmsAccessState.isUnavailable &&
    Routes.miniAppRootForLocation(matchedLocation) == Routes.cms;
