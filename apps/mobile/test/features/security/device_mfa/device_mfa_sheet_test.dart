import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/security/device_mfa/device_mfa_repository.dart';
import 'package:mobile/features/security/device_mfa/device_mfa_service.dart';
import 'package:mobile/features/security/device_mfa/device_mfa_sheet.dart';
import 'package:mocktail/mocktail.dart';
import '../../../helpers/helpers.dart';

class _Service extends Mock implements DeviceMfaService {}

void main() {
  late _Service service;
  setUp(() {
    service = _Service();
    when(service.status).thenAnswer(
      (_) async => (
        registry: const DeviceMfaRegistry(locked: false, devices: []),
        currentFactorId: null,
      ),
    );
  });

  Future<void> open(WidgetTester tester, Size size) async {
    tester.view.physicalSize = size;
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpApp(
      Builder(
        builder: (context) => Scaffold(
          body: TextButton(
            onPressed: () =>
                unawaited(showDeviceMfaSheet(context, service: service)),
            child: const Text('Set up'),
          ),
        ),
      ),
    );
    expect(find.text('Device name'), findsNothing);
    await tester.tap(find.text('Set up'));
    await tester.pumpAndSettle();
  }

  for (final size in [
    const Size(390, 844),
    const Size(844, 390),
    const Size(768, 1024),
    const Size(1376, 1032),
  ]) {
    testWidgets('dismissible setup fits $size', (tester) async {
      await open(tester, size);
      expect(find.text('Device authenticator'), findsOneWidget);
      expect(find.text('Trusted authenticators'), findsNothing);
      expect(tester.takeException(), isNull);
      await tester.tap(find.byTooltip('Close authenticator'));
      await tester.pumpAndSettle();
      expect(find.text('Device authenticator'), findsNothing);
      expect(find.text('Set up'), findsOneWidget);
    });
  }

  testWidgets('retry repeats enrollment and explains service failures', (
    tester,
  ) async {
    when(
      () => service.enroll(
        name: any(named: 'name'),
        reason: any(named: 'reason'),
      ),
    ).thenThrow(
      const ApiException(message: 'private provider detail', statusCode: 503),
    );
    await open(tester, const Size(390, 844));
    await tester.tap(find.text('Register this device'));
    await tester.pumpAndSettle();
    expect(
      find.text(
        'Authenticator registration is temporarily unavailable. '
        'Try again shortly.',
      ),
      findsOneWidget,
    );
    expect(find.text('private provider detail'), findsNothing);
    await tester.tap(find.text('Retry'));
    await tester.pumpAndSettle();
    verify(
      () => service.enroll(
        name: any(named: 'name'),
        reason: any(named: 'reason'),
      ),
    ).called(2);
    verify(service.status).called(1);
    await tester.tap(find.byTooltip('Close authenticator'));
    await tester.pumpAndSettle();
  });
}
