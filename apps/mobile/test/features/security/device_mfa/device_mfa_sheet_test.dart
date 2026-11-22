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

  Future<void> open(
    WidgetTester tester,
    Size size, {
    bool settle = true,
  }) async {
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
    if (settle) {
      await tester.pumpAndSettle();
    } else {
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
    }
  }

  testWidgets('initial status loading remains dismissible', (tester) async {
    final status =
        Completer<({DeviceMfaRegistry registry, String? currentFactorId})>();
    when(service.status).thenAnswer((_) => status.future);
    await open(tester, const Size(390, 844), settle: false);
    await tester.tap(find.byTooltip('Close authenticator'));
    // Resolve while the exit transition is still mounted.
    await tester.pump();
    status.complete((
      registry: const DeviceMfaRegistry(locked: false, devices: []),
      currentFactorId: null,
    ));
    await tester.pumpAndSettle();
    expect(find.text('Device authenticator'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('pending status read hides registration claim until loaded', (
    tester,
  ) async {
    final status =
        Completer<({DeviceMfaRegistry registry, String? currentFactorId})>();
    when(service.status).thenAnswer((_) => status.future);
    await open(tester, const Size(390, 844), settle: false);

    expect(find.text("This device isn't registered"), findsNothing);
    expect(find.text('This device is registered'), findsNothing);
    expect(find.text('Checking device security…'), findsOneWidget);

    status.complete((
      registry: DeviceMfaRegistry(
        locked: false,
        devices: [
          TrustedAuthenticator(
            factorId: 'f-this',
            name: 'Skora Macbook M3 Pro',
            verified: true,
            createdAt: DateTime.utc(2026, 11, 18, 12),
          ),
        ],
      ),
      currentFactorId: 'f-this',
    ));
    await tester.pumpAndSettle();

    expect(find.text('This device is registered'), findsOneWidget);
    expect(find.text("This device isn't registered"), findsNothing);
    await tester.tap(find.byTooltip('Close authenticator'));
    await tester.pumpAndSettle();
  });

  testWidgets(
    'failed initial status read retries without claiming unregistered',
    (tester) async {
      var calls = 0;
      when(service.status).thenAnswer((_) async {
        if (++calls == 1) {
          throw const ApiException.transport(message: 'offline');
        }
        return (
          registry: DeviceMfaRegistry(
            locked: false,
            devices: [
              TrustedAuthenticator(
                factorId: 'f-this',
                name: 'Skora Macbook M3 Pro',
                verified: true,
                createdAt: DateTime.utc(2026, 11, 18, 12),
              ),
            ],
          ),
          currentFactorId: 'f-this',
        );
      });
      await open(tester, const Size(390, 844));

      expect(find.text('Could not finish this step'), findsOneWidget);
      expect(find.text('Retry'), findsOneWidget);
      expect(find.text("This device isn't registered"), findsNothing);

      await tester.tap(find.text('Retry'));
      await tester.pumpAndSettle();

      expect(find.text('Could not finish this step'), findsNothing);
      expect(find.text('This device is registered'), findsOneWidget);
      await tester.tap(find.byTooltip('Close authenticator'));
      await tester.pumpAndSettle();
    },
  );

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
        const ApiException.transport(message: 'offline'),
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
        throw const ApiException.transport(message: 'offline');
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

  group('registered device', () {
    setUp(() {
      when(service.status).thenAnswer(
        (_) async => (
          registry: DeviceMfaRegistry(
            locked: false,
            devices: [
              TrustedAuthenticator(
                factorId: 'f-this',
                name: 'Skora Macbook M3 Pro',
                verified: true,
                createdAt: DateTime.utc(2026, 11, 18, 12),
              ),
              TrustedAuthenticator(
                factorId: 'f-phone',
                name: 'Skora iPhone 13',
                verified: true,
                createdAt: DateTime.utc(2026, 9, 20, 12),
              ),
              TrustedAuthenticator(
                factorId: 'f-new',
                name: 'Work laptop',
                verified: false,
                createdAt: DateTime.utc(2026, 11, 21, 12),
              ),
            ],
          ),
          currentFactorId: 'f-this',
        ),
      );
    });

    testWidgets('shows status, locale dates and the This device badge', (
      tester,
    ) async {
      await open(tester, const Size(390, 1600));
      expect(find.text('This device is registered'), findsOneWidget);
      expect(
        find.text('Skora Macbook M3 Pro · 2 trusted devices'),
        findsOneWidget,
      );
      expect(find.text('Added Sep 20, 2026'), findsOneWidget);
      expect(find.textContaining('2026-09-20'), findsNothing);
      expect(find.text('This device'), findsOneWidget);
      expect(find.text('Setup incomplete'), findsOneWidget);
      expect(find.byTooltip('Remove Skora Macbook M3 Pro'), findsNothing);
      expect(find.byTooltip('Remove Skora iPhone 13'), findsOneWidget);
      expect(find.text('Lock new registrations'), findsOneWidget);
      expect(find.text('Keep a second trusted device'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await tester.tap(find.byTooltip('Close authenticator'));
      await tester.pumpAndSettle();
    });

    testWidgets('removing a trusted device waits for confirmation', (
      tester,
    ) async {
      when(
        () => service.removeTrustedDevice(any(), reason: any(named: 'reason')),
      ).thenAnswer((_) async {});
      await open(tester, const Size(390, 1600));
      await tester.tap(find.byTooltip('Remove Skora iPhone 13'));
      await tester.pumpAndSettle();
      expect(find.text('Remove Skora iPhone 13?'), findsOneWidget);
      await tester.tap(find.text('Cancel'));
      await tester.pumpAndSettle();
      verifyNever(
        () => service.removeTrustedDevice(any(), reason: any(named: 'reason')),
      );

      await tester.tap(find.byTooltip('Remove Skora iPhone 13'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Remove trusted device'));
      await tester.pumpAndSettle();
      verify(
        () => service.removeTrustedDevice(
          'f-phone',
          reason: any(named: 'reason'),
        ),
      ).called(1);
      await tester.tap(find.byTooltip('Close authenticator'));
      await tester.pumpAndSettle();
    });

    testWidgets('removing this authenticator waits for confirmation', (
      tester,
    ) async {
      when(
        () => service.remove(reason: any(named: 'reason')),
      ).thenAnswer((_) async {});
      await open(tester, const Size(390, 1600));
      await tester.tap(find.text('Remove this authenticator'));
      await tester.pumpAndSettle();
      expect(find.text('Remove this authenticator?'), findsOneWidget);
      await tester.tap(find.text('Cancel'));
      await tester.pumpAndSettle();
      verifyNever(() => service.remove(reason: any(named: 'reason')));

      await tester.tap(find.text('Remove this authenticator'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Remove this authenticator').last);
      await tester.pumpAndSettle();
      verify(() => service.remove(reason: any(named: 'reason'))).called(1);
      await tester.tap(find.byTooltip('Close authenticator'));
      await tester.pumpAndSettle();
    });

    testWidgets('the code shows with a countdown and hides again', (
      tester,
    ) async {
      when(
        () => service.code(reason: any(named: 'reason')),
      ).thenAnswer((_) async => '482913');
      final semantics = tester.ensureSemantics();
      await open(tester, const Size(390, 1600));
      await tester.tap(find.text('Show verification code'));
      // The code rotates within 30 s, so pump a frame instead of settling.
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));
      expect(find.text('482913'), findsOneWidget);
      expect(
        find.bySemanticsLabel(RegExp(r'^Changes in \d+ seconds?$')),
        findsOneWidget,
      );
      await tester.tap(find.text('Hide code'));
      await tester.pump();
      expect(find.text('482913'), findsNothing);
      semantics.dispose();
      await tester.tap(find.byTooltip('Close authenticator'));
      await tester.pumpAndSettle();
    });
  });
}
