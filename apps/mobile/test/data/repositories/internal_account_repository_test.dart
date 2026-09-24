import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/repositories/internal_account_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mocktail/mocktail.dart';

class _Api extends Mock implements ApiClient {}

void main() {
  late _Api api;
  late InternalAccountRepository repository;
  const payload = {
    'id': 'target',
    'email': 'target@tuturuuu.com',
    'isDisabled': false,
    'isSelf': false,
    'displayName': 'Target',
    'username': null,
    'lastSignInAt': '2026-09-22T00:00:00Z',
  };
  final account = InternalAccount.fromJson(payload);

  setUp(() {
    api = _Api();
    repository = InternalAccountRepository(apiClient: api);
  });

  test(
    'lists disabled and pending accounts with encoded search and cursor',
    () async {
      when(() => api.getJson(any())).thenAnswer(
        (_) async => {
          'accounts': [payload],
          'count': 52,
          'nextCursor': '50',
        },
      );
      final result = await repository.list(
        query: ' name+tag@tuturuuu.com ',
        cursor: '2',
      );
      final uri = Uri.parse(
        verify(() => api.getJson(captureAny())).captured.single as String,
      );
      expect(uri.queryParameters, {
        'limit': '50',
        'activeOnly': 'false',
        'verifiedOnly': 'false',
        'q': 'name+tag@tuturuuu.com',
        'cursor': '2',
      });
      expect(result.accounts.single.email, account.email);
      expect(result.accounts.single.lastSignInAt?.isUtc, isTrue);
      expect(result.count, 52);
      expect(result.nextCursor, '50');
    },
  );

  test('sends password only to the authenticated account mutation', () async {
    when(
      () => api.patchJson(any(), any()),
    ).thenAnswer((_) async => {'account': payload});
    final result = await repository.resetPassword(
      account,
      password: 'test-only-password',
      confirmationEmail: ' target@tuturuuu.com ',
    );
    verify(
      () => api.patchJson('${InternalAccountRepository.endpoint}/target', {
        'action': 'reset_password',
        'confirmationEmail': account.email,
        'newPassword': 'test-only-password',
      }),
    ).called(1);
    expect(result.id, account.id);
  });

  test('resets authenticators through the confirmed account action', () async {
    when(
      () => api.patchJson(any(), any()),
    ).thenAnswer((_) async => {'account': payload});
    await repository.resetAuthenticators(
      account,
      confirmationEmail: ' target@tuturuuu.com ',
    );
    verify(
      () => api.patchJson('${InternalAccountRepository.endpoint}/target', {
        'action': 'reset_mfa',
        'confirmationEmail': account.email,
      }),
    ).called(1);
  });

  for (final required in [true, false]) {
    test('sets the confirmed MFA policy to required=$required', () async {
      when(() => api.patchJson(any(), any())).thenAnswer(
        (_) async => {
          'account': {
            ...payload,
            'mfaRequired': required,
            'mfaPolicyAvailable': true,
          },
        },
      );
      final updated = await repository.setMfaPolicy(
        account,
        required: required,
        confirmationEmail: ' target@tuturuuu.com ',
      );
      verify(
        () => api.patchJson('${InternalAccountRepository.endpoint}/target', {
          'action': required ? 'require_mfa' : 'optional_mfa',
          'confirmationEmail': account.email,
        }),
      ).called(1);
      expect(updated.mfaRequired, required);
      expect(updated.mfaPolicyAvailable, isTrue);
    });
  }

  for (final enabled in [true, false]) {
    test('uses the correct access action for enabled=$enabled', () async {
      when(
        () => api.patchJson(any(), any()),
      ).thenAnswer((_) async => {'account': payload});
      await repository.setAccess(
        account,
        enabled: enabled,
        confirmationEmail: account.email,
      );
      verify(
        () => api.patchJson('${InternalAccountRepository.endpoint}/target', {
          'action': enabled ? 'enable_access' : 'disable_access',
          'confirmationEmail': account.email,
        }),
      ).called(1);
    });
  }

  test('normalizes profile input without sending access mutations', () async {
    when(
      () => api.patchJson(any(), any()),
    ).thenAnswer((_) async => {'account': payload});
    await repository.updateProfile(
      account,
      displayName: ' Target ',
      username: ' ',
    );
    verify(
      () => api.patchJson('${InternalAccountRepository.endpoint}/target', {
        'action': 'update_profile',
        'displayName': 'Target',
        'username': null,
      }),
    ).called(1);
  });

  test(
    'propagates revoked access instead of returning a cached directory',
    () async {
      when(
        () => api.getJson(any()),
      ).thenThrow(const ApiException(message: 'Forbidden', statusCode: 403));
      await expectLater(repository.list(), throwsA(isA<ApiException>()));
    },
  );

  test('does not dispose an injected client owned by the caller', () {
    repository.dispose();
    verifyNever(() => api.dispose());
  });
}
