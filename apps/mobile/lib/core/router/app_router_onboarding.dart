import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/onboarding/data/onboarding_gate.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';

/// Loads the onboarding gate once the session state is known.
///
/// It must run while signed out too: the gate's first run records the
/// accounts already on the device, so only later sign-ins owe the flow.
void primeOnboardingGate(OnboardingGate? gate, AuthState auth) {
  if (gate == null || auth.status == AuthStatus.unknown) return;
  gate.prime(
    activeUserId: auth.user?.id,
    savedAccountIds: auth.accounts.map((account) => account.id),
  );
}

/// Sends a signed-in account that still owes the first-run onboarding to
/// it, and back to where it was headed once the flow is done or skipped.
///
/// Runs only after the auth, MFA and workspace redirects have passed: the
/// account is authenticated, not adding another account or switching, and
/// has a workspace selected. Settings, the profile editor, the workspace
/// picker and the telemetry prompt are left alone.
String? resolveOnboardingRedirect({
  required OnboardingGate? gate,
  required AuthState auth,
  required WorkspaceState workspace,
  required Uri uri,
  required String matchedLocation,
}) {
  if (gate == null) return null;
  final user = auth.user;
  final eligible =
      auth.status == AuthStatus.authenticated &&
      user != null &&
      !auth.isAddAccountFlow &&
      auth.switchingAccountId == null &&
      workspace.hasWorkspace;
  final pending = eligible && gate.isPending(user.id);
  if (matchedLocation == Routes.onboarding) {
    // An account that no longer owes the flow, or that cannot run it now,
    // never stays on it.
    return pending ? null : onboardingReturnTarget(uri.queryParameters['from']);
  }
  if (!pending || _exempt(matchedLocation)) return null;
  return Uri(
    path: Routes.onboarding,
    queryParameters: {'from': uri.toString()},
  ).toString();
}

bool _exempt(String location) =>
    location == Routes.workspaceSelect ||
    location == Routes.telemetryConsent ||
    location == Routes.profileEdit ||
    location == Routes.settings ||
    location.startsWith('${Routes.settings}/');

/// The in-app location onboarding returns to; anything else goes home.
String onboardingReturnTarget(String? from) {
  if (from == null ||
      !from.startsWith('/') ||
      from.startsWith('//') ||
      from.startsWith(Routes.onboarding)) {
    return Routes.home;
  }
  return from;
}
