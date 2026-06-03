import 'package:bloc/bloc.dart';
import 'package:equatable/equatable.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/stored_auth_account.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:supabase_flutter/supabase_flutter.dart' as supa;

supa.User _user(String id) => supa.User.fromJson({
  'id': id,
  'aud': 'authenticated',
  'role': 'authenticated',
  'email': '$id@example.com',
  'app_metadata': const <String, dynamic>{},
  'user_metadata': const <String, dynamic>{},
  'created_at': '2024-01-01T00:00:00.000000Z',
})!;

void main() {
  test('redacts stored account secrets from Bloc change logs', () {
    final previousStringify = EquatableConfig.stringify;
    EquatableConfig.stringify = true;
    addTearDown(() => EquatableConfig.stringify = previousStringify);

    const secretSessionJson =
        '{"access_token":"access-token-secret",'
        '"refresh_token":"refresh-token-secret"}';
    const rotatedSessionJson =
        '{"access_token":"rotated-access-token",'
        '"refresh_token":"rotated-refresh-token"}';

    const account = StoredAuthAccount(
      id: 'user-1',
      refreshToken: 'refresh-token-secret',
      sessionJson: secretSessionJson,
      email: 'user-1@example.com',
      lastActiveAt: 100,
      addedAt: 50,
    );
    final rotated = account.copyWith(
      refreshToken: 'rotated-refresh-token-secret',
      sessionJson: rotatedSessionJson,
      lastActiveAt: 101,
    );

    final change = Change<AuthState>(
      currentState: AuthState.authenticated(
        _user('user-1'),
      ).copyWith(accounts: const <StoredAuthAccount>[account]),
      nextState: AuthState.authenticated(
        _user('user-1'),
      ).copyWith(accounts: <StoredAuthAccount>[rotated]),
    );

    final logLine = change.toString();

    expect(logLine, isNot(contains('refresh-token-secret')));
    expect(logLine, isNot(contains('access-token-secret')));
    expect(logLine, isNot(contains('rotated-refresh-token-secret')));
    expect(logLine, isNot(contains('rotated-access-token')));
    expect(logLine, contains('[redacted]'));
  });
}
