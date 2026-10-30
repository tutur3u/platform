import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/stored_auth_account.dart';
import 'package:mobile/data/repositories/auth_repository.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mocktail/mocktail.dart';
import 'package:supabase_flutter/supabase_flutter.dart' as supa;

class _MockAuthRepository extends Mock implements AuthRepository {}

supa.User _user() => supa.User.fromJson({
  'id': 'user-1',
  'aud': 'authenticated',
  'role': 'authenticated',
  'email': 'user@example.com',
  'app_metadata': const <String, dynamic>{},
  'user_metadata': const <String, dynamic>{},
  'created_at': '2024-01-01T00:00:00.000000Z',
})!;

/// Every session transition runs `onBeforeSignOut` (which re-reads telemetry
/// consent in app.dart) before the repository changes the session, so
/// collection is never carried into another account on trust.
void main() {
  late AuthRepository repo;
  late List<String> events;

  setUp(() {
    events = [];
    repo = _MockAuthRepository();
    when(() => repo.getCurrentUserSync()).thenReturn(_user());
    when(() => repo.onAuthStateChange())
        .thenAnswer((_) => const Stream<supa.AuthState>.empty());
    when(() => repo.dispose()).thenReturn(null);
    when(() => repo.checkMfaRequired()).thenReturn(false);
    when(() => repo.getStoredAccounts())
        .thenAnswer((_) async => const <StoredAuthAccount>[]);
    when(() => repo.getActiveStoredAccountId()).thenAnswer((_) async => 'a');
    when(
      () => repo.syncCurrentSessionToMultiAccountStore(
        switchImmediately: any(named: 'switchImmediately'),
      ),
    ).thenAnswer((_) async {});
    when(() => repo.signOut()).thenAnswer((_) async => events.add('repo'));
    when(() => repo.switchToStoredAccount(any())).thenAnswer((_) async {
      events.add('repo');
      return (success: false, error: 'stop');
    });
    when(() => repo.signOutCurrentAccount()).thenAnswer((_) async {
      events.add('repo');
      return (switched: false, error: 'stop');
    });
    when(() => repo.signOutAllAccounts()).thenAnswer((_) async {
      events.add('repo');
      return (success: false, error: 'stop');
    });
    when(() => repo.removeStoredAccount(any())).thenAnswer((_) async {
      events.add('repo');
      return (success: false, switched: false, error: 'stop');
    });
  });

  final transitions = <String, Future<Object?> Function(AuthCubit)>{
    'sign out': (c) => c.signOut(),
    'account switch': (c) => c.switchAccount('b'),
    'sign out of the current account': (c) => c.signOutCurrentAccount(),
    'sign out of all accounts': (c) => c.signOutAllAccounts(),
    'removing the active account': (c) => c.removeAccount('user-1'),
  };

  for (final entry in transitions.entries) {
    test('${entry.key} re-reads consent before the session changes', () async {
      final cubit = AuthCubit(
        authRepository: repo,
        onBeforeSignOut: () async => events.add('consent'),
      );
      addTearDown(cubit.close);
      await Future<void>.delayed(Duration.zero);
      await entry.value(cubit);
      expect(events, ['consent', 'repo']);
    });
  }
}
