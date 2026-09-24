import 'dart:async';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/stored_auth_account.dart';
import 'package:mobile/data/repositories/auth_repository.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mocktail/mocktail.dart';
import 'package:supabase_flutter/supabase_flutter.dart' as supa;

class _Repo extends Mock implements AuthRepository {}

const user = supa.User(
  id: 'actor',
  appMetadata: {},
  userMetadata: {},
  aud: 'authenticated',
  createdAt: '2026-01-01',
);
void main() {
  late _Repo repo;
  setUp(() {
    repo = _Repo();
    when(repo.getCurrentUserSync).thenReturn(user);
    when(repo.checkMfaRequired).thenReturn(false);
    when(
      repo.onAuthStateChange,
    ).thenAnswer((_) => const Stream<supa.AuthState>.empty());
    when(repo.getStoredAccounts).thenAnswer((_) async => <StoredAuthAccount>[]);
    when(repo.getActiveStoredAccountId).thenAnswer((_) async => null);
    when(repo.syncCurrentSessionToMultiAccountStore).thenAnswer((_) async {});
    when(repo.refreshSession).thenAnswer((_) async {});
    when(repo.dispose).thenReturn(null);
  });
  test(
    'optional accounts retain instant cached startup and offline resume',
    () async {
      when(repo.refreshSession).thenThrow(const supa.AuthException('Offline'));
      final cubit = AuthCubit(authRepository: repo);
      expect(cubit.state.status, AuthStatus.authenticated);
      await cubit.refreshAccountAssurance();
      expect(cubit.state.status, AuthStatus.authenticated);
      await cubit.close();
    },
  );
  test('resume gates known stale required proof even while offline', () async {
    final cubit = AuthCubit(authRepository: repo);
    await Future<void>.delayed(Duration.zero);
    when(repo.checkMfaRequired).thenReturn(true);
    when(repo.refreshSession).thenThrow(const supa.AuthException('Offline'));
    await cubit.refreshAccountAssurance();
    expect(cubit.state.status, AuthStatus.mfaRequired);
    await cubit.close();
  });
  test(
    'authoritative resume refresh routes an already signed-in account to MFA',
    () async {
      final cubit = AuthCubit(authRepository: repo);
      await Future<void>.delayed(Duration.zero);
      when(repo.refreshSession).thenAnswer((_) async {
        when(repo.checkMfaRequired).thenReturn(true);
      });
      await cubit.refreshAccountAssurance();
      expect(cubit.state.status, AuthStatus.mfaRequired);
      await cubit.close();
    },
  );
}
