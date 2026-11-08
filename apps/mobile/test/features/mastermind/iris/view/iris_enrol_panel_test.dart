import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mastermind/iris/data/iris_device_identity.dart';
import 'package:mobile/features/mastermind/iris/data/iris_models.dart';
import 'package:mobile/features/mastermind/iris/data/iris_relay.dart';
import 'package:mobile/features/mastermind/iris/view/iris_devices_page.dart';

import '../../../../helpers/pump_app.dart';

const _device = '0f1e2d3c-4b5a-8978-8695-a4b3c2d1e0f0';

void main() {
  late _EnrolRelay relay;
  late _Identity identity;

  setUp(() {
    relay = _EnrolRelay();
    identity = _Identity();
  });

  Future<void> pumpPage(WidgetTester tester) async {
    await tester.pumpApp(
      Material(
        child: IrisDevicesPage(relay: relay, identity: identity),
      ),
    );
    await tester.pump();
  }

  Future<void> start(WidgetTester tester) async {
    await tester.tap(find.byKey(const ValueKey('iris-enrol-start')));
    await tester.pump();
    await tester.pump();
  }

  testWidgets('a held code is replaced once with a new one', (tester) async {
    relay.replies = [
      const IrisErr(IrisFailure(IrisFailureKind.codeConflict)),
      null,
    ];
    await pumpPage(tester);
    await start(tester);
    expect(relay.codes, hasLength(2));
    expect(relay.codes.first, isNot(relay.codes.last));
    expect(find.byKey(const ValueKey('iris-enrol-code')), findsOneWidget);
  });

  testWidgets('a second held code stops and says so', (tester) async {
    relay.replies = [
      const IrisErr(IrisFailure(IrisFailureKind.codeConflict)),
      const IrisErr(IrisFailure(IrisFailureKind.codeConflict)),
    ];
    await pumpPage(tester);
    await start(tester);
    expect(relay.codes, hasLength(2));
    expect(
      find.text('That code is already in use. Try again.'),
      findsOneWidget,
    );
  });

  testWidgets('a known key is replaced only when the owner asks', (
    tester,
  ) async {
    relay.replies = [
      const IrisErr(IrisFailure(IrisFailureKind.deviceConflict)),
      null,
    ];
    await pumpPage(tester);
    await start(tester);
    expect(
      find.text('This key is already registered. Enrol again with a new key.'),
      findsOneWidget,
    );
    expect(identity.forgets, 0);
    await tester.tap(find.byKey(const ValueKey('iris-enrol-again')));
    await tester.pump();
    await tester.pump();
    expect(identity.forgets, 1);
    expect(find.byKey(const ValueKey('iris-enrol-code')), findsOneWidget);
  });

  testWidgets('a stopped relay says so and offers no retry', (tester) async {
    relay.replies = [const IrisErr(IrisFailure(IrisFailureKind.relayStopped))];
    await pumpPage(tester);
    await start(tester);
    expect(
      find.text('Relay stopped. Ask the owner to restore it.'),
      findsOneWidget,
    );
    expect(find.byKey(const ValueKey('iris-enrol-start')), findsNothing);
    expect(relay.codes, hasLength(1));
  });

  testWidgets('limits read plainly', (tester) async {
    relay.replies = [const IrisErr(IrisFailure(IrisFailureKind.rateLimited))];
    await pumpPage(tester);
    await start(tester);
    expect(
      find.text(
        'Too many enrolment attempts or pending devices. Try again later.',
      ),
      findsOneWidget,
    );
  });

  testWidgets('a relay without the device list still enrols', (tester) async {
    await pumpPage(tester);
    expect(
      find.text(
        "The device list isn't available yet. You can still enrol this "
        'device.',
      ),
      findsOneWidget,
    );
    expect(relay.listCalls, 1);
    await start(tester);
    expect(find.byKey(const ValueKey('iris-enrol-code')), findsOneWidget);
    // One reload after enrolment, then no retry loop.
    await tester.pump(const Duration(seconds: 30));
    expect(relay.listCalls, 2);
  });
}

/// Answers enrolment from [replies] (null: accepted) and 404s the device
/// list, as the Worker does today.
final class _EnrolRelay implements IrisRelay {
  List<IrisResult<IrisEnrollment>?> replies = [null];
  final codes = <String>[];
  int listCalls = 0;

  @override
  bool get isConfigured => true;

  @override
  Future<IrisResult<IrisEnrollment>> enroll(
    String publicKey,
    String fingerprint, {
    required String deviceId,
    required String code,
  }) async {
    codes.add(code);
    final reply = replies.isEmpty ? null : replies.removeAt(0);
    return reply ??
        IrisOk(
          IrisEnrollment(
            deviceId: deviceId,
            code: code,
            fingerprintPrefix: fingerprint.substring(0, 8),
            expiresAt: DateTime.now().toUtc().add(const Duration(minutes: 15)),
          ),
        );
  }

  @override
  Future<IrisResult<List<IrisDevice>>> devices() async {
    listCalls++;
    return const IrisErr(IrisFailure(IrisFailureKind.notFound));
  }

  @override
  Object? noSuchMethod(Invocation invocation) =>
      throw UnimplementedError('${invocation.memberName}');
}

final class _Identity implements IrisDeviceIdentity {
  int forgets = 0;

  @override
  Future<bool> isEnrolled() async => false;

  @override
  Future<IrisDeviceKeyMaterial?> load() async =>
      (deviceId: _device, publicKey: 'spki', fingerprint: 'a' * 64);

  @override
  Future<void> pending(IrisEnrollment enrolment) async {}

  @override
  Future<IrisDeviceStatus> check(
    IrisRelay relay,
    IrisEnrollment enrolment,
  ) async => IrisDeviceStatus.pending;

  @override
  Future<void> forget() async => forgets++;
}
