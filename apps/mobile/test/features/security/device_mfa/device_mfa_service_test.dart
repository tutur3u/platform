import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/security/data/local_auth_service.dart';
import 'package:mobile/features/security/device_mfa/device_mfa_repository.dart';
import 'package:mobile/features/security/device_mfa/device_mfa_service.dart';
import 'package:mocktail/mocktail.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class _Repository extends Mock implements DeviceMfaRepository {}

class _Client extends Mock implements SupabaseClient {}

class _Auth extends Mock implements GoTrueClient {}

class _Mfa extends Mock implements GoTrueMFAApi {}

class _Store extends Mock implements DeviceMfaStore {}

class _Local extends Mock implements LocalAuthService {}

void main() {
  late _Repository repository;
  late _Client client;
  late _Auth auth;
  late _Mfa mfa;
  late _Store store;
  late _Local local;
  late DeviceMfaService service;
  const credential = DeviceMfaCredential(
    factorId: 'factor-1',
    secret: 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',
    verified: true,
    proof: 'registered-device-proof',
  );
  const user = User(
    id: 'user-1',
    appMetadata: {},
    userMetadata: {},
    aud: 'authenticated',
    createdAt: '2026-01-01',
  );
  setUp(() {
    repository = _Repository();
    client = _Client();
    auth = _Auth();
    mfa = _Mfa();
    store = _Store();
    local = _Local();
    when(() => client.auth).thenReturn(auth);
    when(() => auth.currentUser).thenReturn(user);
    when(() => auth.mfa).thenReturn(mfa);
    when(() => store.read('user-1')).thenAnswer((_) async => credential);
    when(
      () => local.authenticate(reason: any(named: 'reason')),
    ).thenAnswer((_) async => true);
    service = DeviceMfaService(
      client: client,
      repository: repository,
      store: store,
      localAuth: local,
      now: () => DateTime.fromMillisecondsSinceEpoch(59000),
    );
  });
  test(
    'does not read the secret when biometric verification is cancelled',
    () async {
      when(
        () => local.authenticate(reason: any(named: 'reason')),
      ).thenAnswer((_) async => false);
      await expectLater(
        service.code(reason: 'verify'),
        throwsA(isA<AuthException>()),
      );
      verifyNever(() => store.read(any()));
    },
  );
  test(
    'does not expose a code if the account changes during local verification',
    () async {
      when(() => local.authenticate(reason: any(named: 'reason'))).thenAnswer((
        _,
      ) async {
        when(() => auth.currentUser).thenReturn(null);
        return true;
      });
      await expectLater(
        service.code(reason: 'verify'),
        throwsA(isA<AuthException>()),
      );
      verifyNever(() => store.read(any()));
    },
  );
  test('returns an account-scoped RFC code after local verification', () async {
    expect(await service.code(reason: 'verify'), '287082');
    verify(() => store.read('user-1')).called(1);
  });
  test(
    'requires fresh local verification even when the session is AAL2',
    () async {
      when(() => mfa.getAuthenticatorAssuranceLevel()).thenReturn(
        const AuthMFAGetAuthenticatorAssuranceLevelResponse(
          currentLevel: AuthenticatorAssuranceLevels.aal2,
          nextLevel: AuthenticatorAssuranceLevels.aal2,
          currentAuthenticationMethods: [],
        ),
      );
      await service.verify(reason: 'verify');
      verify(() => local.authenticate(reason: 'verify')).called(1);
      verifyNever(
        () => mfa.challengeAndVerify(
          factorId: any(named: 'factorId'),
          code: any(named: 'code'),
        ),
      );
    },
  );
  test(
    're-enrollment discards only a confirmed remotely revoked factor',
    () async {
      when(() => mfa.getAuthenticatorAssuranceLevel()).thenReturn(
        const AuthMFAGetAuthenticatorAssuranceLevelResponse(
          currentLevel: AuthenticatorAssuranceLevels.aal2,
          nextLevel: AuthenticatorAssuranceLevels.aal2,
          currentAuthenticationMethods: [],
        ),
      );
      when(mfa.listFactors).thenAnswer(
        (_) async =>
            const AuthMFAListFactorsResponse(all: [], totp: [], phone: []),
      );
      when(() => store.delete('user-1')).thenAnswer((_) async {});
      when(
        () => repository.change(any()),
      ).thenThrow(const AuthException('Registration locked'));
      await expectLater(
        service.enroll(name: 'Phone', reason: 'verify'),
        throwsA(isA<AuthException>()),
      );
      verify(() => store.delete('user-1')).called(1);
      verify(
        () => repository.change({'action': 'enroll', 'name': 'Phone'}),
      ).called(1);
    },
  );

  test('provider outage does not erase a recoverable local factor', () async {
    when(() => mfa.getAuthenticatorAssuranceLevel()).thenReturn(
      const AuthMFAGetAuthenticatorAssuranceLevelResponse(
        currentLevel: AuthenticatorAssuranceLevels.aal2,
        nextLevel: AuthenticatorAssuranceLevels.aal2,
        currentAuthenticationMethods: [],
      ),
    );
    when(mfa.listFactors).thenThrow(const AuthException('Offline'));
    await expectLater(
      service.enroll(name: 'Phone', reason: 'verify'),
      throwsA(isA<AuthException>()),
    );
    verifyNever(() => store.delete(any()));
    verifyNever(() => repository.change(any()));
  });

  test('keeps the secret when server revocation fails', () async {
    when(() => mfa.getAuthenticatorAssuranceLevel()).thenReturn(
      const AuthMFAGetAuthenticatorAssuranceLevelResponse(
        currentLevel: AuthenticatorAssuranceLevels.aal2,
        nextLevel: AuthenticatorAssuranceLevels.aal2,
        currentAuthenticationMethods: [],
      ),
    );
    when(
      () => repository.change(any()),
    ).thenThrow(const AuthException('offline'));
    await expectLater(
      service.remove(reason: 'verify'),
      throwsA(isA<AuthException>()),
    );
    verifyNever(() => store.delete(any()));
  });
}
