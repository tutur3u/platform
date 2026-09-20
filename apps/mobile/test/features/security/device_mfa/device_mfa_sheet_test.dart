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
      if (size.width >= 600) {
        final surface = find
            .ancestor(
              of: find.text('Device authenticator'),
              matching: find.byType(Material),
            )
            .first;
        expect(tester.getSize(surface).height, lessThan(600));
      }
      expect(tester.takeException(), isNull);
      await tester.tap(find.byTooltip('Close authenticator'));
      await tester.pumpAndSettle();
      expect(find.text('Device authenticator'), findsNothing);
      expect(find.text('Set up'), findsOneWidget);
    });
  }

  for (final size in [const Size(390, 844), const Size(1024, 768)]) {
    testWidgets('registration blocks dismissal until finished at $size', (
      tester,
    ) async {
      final enrollment = Completer<void>();
      when(
        () => service.enroll(
          name: any(named: 'name'),
          reason: any(named: 'reason'),
        ),
      ).thenAnswer((_) => enrollment.future);
      await open(tester, size);
      await tester.tap(find.text('Register this device'));
      await tester.pump();
      expect(
        tester
            .widget<IconButton>(
              find.byWidgetPredicate(
                (widget) =>
                    widget is IconButton &&
                    widget.tooltip == 'Close authenticator',
              ),
            )
            .onPressed,
        isNull,
      );
      final context = tester.element(find.text('Device authenticator'));
      await Navigator.of(context).maybePop();
      await tester.pump(const Duration(milliseconds: 300));
      expect(find.text('Device authenticator'), findsOneWidget);
      if (size.width >= 600) {
        await tester.tapAt(const Offset(5, 5));
      } else {
        await tester.drag(
          find.text('Device authenticator'),
          const Offset(0, 700),
        );
      }
      await tester.pump(const Duration(milliseconds: 300));
      expect(find.text('Device authenticator'), findsOneWidget);
      enrollment.completeError(
        const ApiException(message: 'offline', statusCode: 0),
      );
      await tester.pumpAndSettle();
      expect(
        tester
            .widget<IconButton>(
              find.byWidgetPredicate(
                (widget) =>
                    widget is IconButton &&
                    widget.tooltip == 'Close authenticator',
              ),
            )
            .onPressed,
        isNotNull,
      );
      await tester.tap(find.byTooltip('Close authenticator'));
      await tester.pumpAndSettle();
      expect(find.text('Device authenticator'), findsNothing);
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
  testWidgets('a failed refresh after enrollment does not enroll twice', (
    tester,
  ) async {
    var reads = 0;
    when(service.status).thenAnswer((_) async {
      if (++reads == 2) {
        throw const ApiException(message: 'offline', statusCode: 0);
      }
      return (
        registry: const DeviceMfaRegistry(locked: false, devices: []),
        currentFactorId: null,
      );
    });
    when(
      () => service.enroll(
        name: any(named: 'name'),
        reason: any(named: 'reason'),
      ),
    ).thenAnswer((_) async {});
    await open(tester, const Size(390, 844));
    await tester.tap(find.text('Register this device'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Retry'));
    await tester.pumpAndSettle();
    verify(
      () => service.enroll(
        name: any(named: 'name'),
        reason: any(named: 'reason'),
      ),
    ).called(1);
    expect(reads, 3);
    await tester.tap(find.byTooltip('Close authenticator'));
    await tester.pumpAndSettle();
  });
}
