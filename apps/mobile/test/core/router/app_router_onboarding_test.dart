import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/router/app_router_onboarding.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/data/models/stored_auth_account.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/onboarding/data/onboarding_gate.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart' show User;

/// Regression coverage for the first-run redirect recorded in
/// apps/docs/platform/features/mobile-onboarding.mdx.
const _user = User(
  id: 'new-user',
  appMetadata: {},
  userMetadata: {},
  aud: 'authenticated',
  createdAt: '',
);

const _workspace = WorkspaceState(
  status: WorkspaceStatus.loaded,
  currentWorkspace: Workspace(id: 'personal', personal: true),
);

void main() {
  late OnboardingGate gate;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    gate = OnboardingGate();
    // A fresh device: nobody was signed in when the gate first ran.
    primeOnboardingGate(gate, const AuthState.unauthenticated());
    await pumpEventQueue();
  });

  String? redirect({
    AuthState auth = const AuthState.authenticated(_user),
    WorkspaceState workspace = _workspace,
    String location = Routes.home,
    String? query,
  }) => resolveOnboardingRedirect(
    gate: gate,
    auth: auth,
    workspace: workspace,
    uri: Uri(path: location, query: query),
    matchedLocation: location,
  );

  test('sends a first sign-in with a workspace to onboarding', () {
    expect(redirect(), '${Routes.onboarding}?from=%2F');
    expect(
      redirect(location: Routes.tasks),
      '${Routes.onboarding}?from=%2Ftasks',
    );
  });

  test('never runs before sign-in or during MFA', () {
    expect(redirect(auth: const AuthState.unauthenticated()), isNull);
    expect(redirect(auth: const AuthState.unknown()), isNull);
    expect(redirect(auth: const AuthState.mfaRequired(_user)), isNull);
  });

  test('waits for a selected workspace', () {
    expect(
      redirect(workspace: const WorkspaceState(status: WorkspaceStatus.loaded)),
      isNull,
    );
  });

  test('stays out of add-account mode and account switching', () {
    final adding = const AuthState.authenticated(
      _user,
    ).copyWith(isAddAccountFlow: true);
    final switching = const AuthState.authenticated(
      _user,
    ).copyWith(switchingAccountId: 'other');
    expect(redirect(auth: adding), isNull);
    expect(redirect(auth: switching), isNull);
  });

  test('leaves settings, the profile editor and consent alone', () {
    for (final location in [
      Routes.settings,
      Routes.settingsReminders,
      Routes.profileEdit,
      Routes.telemetryConsent,
      Routes.workspaceSelect,
    ]) {
      expect(redirect(location: location), isNull, reason: location);
    }
  });

  test('a pending deep link opens and onboarding waits', () {
    gate.deferForSession();
    expect(redirect(location: Routes.tasks), isNull);
    // Already on onboarding when the link arrives: leave for the link's
    // destination flow (the caller navigates there next).
    expect(
      redirect(location: Routes.onboarding, query: 'from=%2Fcalendar'),
      Routes.calendar,
    );
  });

  test('does not run again once completed or skipped', () async {
    await gate.record(_user.id, OnboardingOutcome.completed);
    expect(redirect(), isNull);
    expect(
      redirect(location: Routes.onboarding, query: 'from=%2Ftasks'),
      Routes.tasks,
    );
    await gate.record(_user.id, OnboardingOutcome.skipped);
    expect(redirect(), isNull);
  });

  test('a second account on the device gets its own run', () async {
    await gate.record(_user.id, OnboardingOutcome.completed);
    const second = User(
      id: 'second',
      appMetadata: {},
      userMetadata: {},
      aud: 'authenticated',
      createdAt: '',
    );
    expect(
      redirect(auth: const AuthState.authenticated(second)),
      '${Routes.onboarding}?from=%2F',
    );
  });

  test(
    'accounts already on the device when the gate first ran skip it',
    () async {
      SharedPreferences.setMockInitialValues({});
      gate = OnboardingGate();
      primeOnboardingGate(
        gate,
        const AuthState.authenticated(_user).copyWith(
          accounts: const [
            StoredAuthAccount(
              id: 'saved',
              refreshToken: '',
              lastActiveAt: 1,
              addedAt: 1,
            ),
          ],
        ),
      );
      await pumpEventQueue();
      expect(redirect(), isNull);
    },
  );

  test('onboarding returns only to in-app locations', () {
    expect(onboardingReturnTarget(null), Routes.home);
    expect(onboardingReturnTarget('https://evil.example'), Routes.home);
    expect(onboardingReturnTarget('//evil.example'), Routes.home);
    expect(onboardingReturnTarget('${Routes.onboarding}?x=1'), Routes.home);
    expect(onboardingReturnTarget('/tasks?view=list'), '/tasks?view=list');
  });

  test('without a gate nothing changes', () {
    expect(
      resolveOnboardingRedirect(
        gate: null,
        auth: const AuthState.authenticated(_user),
        workspace: _workspace,
        uri: Uri(path: Routes.home),
        matchedLocation: Routes.home,
      ),
      isNull,
    );
  });
}
