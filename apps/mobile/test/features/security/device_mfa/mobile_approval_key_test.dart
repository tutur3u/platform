import 'dart:convert';

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/security/device_mfa/mobile_approval_key.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const channel = MethodChannel('test/mobile_approval_key');
  const key = MobileApprovalKey(channel: channel);
  const account = '25db9e4c-ef85-4c71-9ac4-1b2373f47474';
  const challenge = MobileApprovalSignatureInput(
    challengeId: 'c7679660-b38b-4f3d-8e99-45eb2dcaffcd',
    nonce: 'KfY5Ffne33EibYJql4vaRa13ZpBQqFN2xet6-SvLM18',
    requesterSessionId: '607a83bf-9af4-45bd-9487-7baf18d7ad9d',
    decidingSessionId: 'ff395a68-3874-4b7a-bb62-98a495517234',
    expiresAt: '2026-11-20T06:44:57.012+00:00',
  );

  void mockChannel(Future<Object?> Function(MethodCall) handler) {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, handler);
  }

  tearDown(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, null);
  });

  test('passes the account ID and returns only the public key', () async {
    final spki = Uint8List.fromList(List<int>.generate(91, (i) => i));
    mockChannel((call) async {
      expect(call.method, 'ensureKey');
      expect(call.arguments, {'accountId': account});
      return spki;
    });

    expect(await key.ensurePublicKey(account), base64.encode(spki));
  });

  test(
    'signs the exact challenge, sessions, action and entered digits',
    () async {
      mockChannel((call) async {
        expect(call.method, 'sign');
        final arguments = call.arguments as Map<Object?, Object?>;
        expect(arguments['accountId'], account);
        expect(arguments['reason'], 'Confirm sign-in');
        expect(
          utf8.decode(arguments['data']! as Uint8List),
          '["tuturuuu.mobile-approval.v2",'
          '"c7679660-b38b-4f3d-8e99-45eb2dcaffcd",'
          '"KfY5Ffne33EibYJql4vaRa13ZpBQqFN2xet6-SvLM18",'
          '"607a83bf-9af4-45bd-9487-7baf18d7ad9d",'
          '"ff395a68-3874-4b7a-bb62-98a495517234",'
          '"approve","03","2026-11-20T06:44:57.012+00:00"]',
        );
        return Uint8List.fromList([0xff, 0xee]);
      });

      expect(
        await key.sign(
          accountId: account,
          input: challenge,
          action: 'approve',
          value: '03',
          reason: 'Confirm sign-in',
        ),
        '_-4',
      );
    },
  );

  test(
    'does not return a signature after system authentication is cancelled',
    () async {
      mockChannel((_) async => throw PlatformException(code: 'cancelled'));

      await expectLater(
        key.sign(
          accountId: account,
          input: challenge,
          action: 'reject',
          value: '',
          reason: 'Deny sign-in',
        ),
        throwsA(
          isA<PlatformException>().having(
            (error) => error.code,
            'code',
            'cancelled',
          ),
        ),
      );
    },
  );
}
