import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/stored_auth_account.dart';

void main() {
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
    email: 'user@example.com',
    displayName: 'User One',
    avatarUrl: 'https://example.com/avatar.png',
    lastWorkspaceId: 'workspace-1',
    lastActiveAt: 100,
    addedAt: 50,
  );

  test('keeps secure storage serialization but redacts debug output', () {
    expect(account.toJson()['refreshToken'], 'refresh-token-secret');
    expect(account.toJson()['sessionJson'], contains('access-token-secret'));

    final debugString = account.toString();

    expect(debugString, isNot(contains('refresh-token-secret')));
    expect(debugString, isNot(contains('access-token-secret')));
    expect(debugString, contains('refreshToken: [redacted]'));
    expect(debugString, contains('sessionJson: [redacted]'));
  });

  test('excludes raw session secrets from equality props', () {
    final rotated = account.copyWith(
      refreshToken: 'rotated-refresh-token-secret',
      sessionJson: rotatedSessionJson,
    );

    expect(account, rotated);
    expect(account.props.join('|'), isNot(contains('refresh-token-secret')));
    expect(account.props.join('|'), isNot(contains('access-token-secret')));
    expect(account.props.join('|'), isNot(contains('rotated-refresh-token')));
  });
}
