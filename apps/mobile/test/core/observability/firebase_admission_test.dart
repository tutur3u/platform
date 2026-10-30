import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/observability/firebase_admission.dart';

void main() {
  late List<String> calls;
  late FirebaseAdmission admission;
  late Future<void> Function() cleanup;
  late bool failDeletion;
  late bool nativeAllows;
  setUp(() {
    calls = [];
    failDeletion = false;
    nativeAllows = true;
    cleanup = () async => calls.add('push-unregistered');
    admission = FirebaseAdmission(
      initialize:
          ({
            required signedIn,
            required pushAllowed,
            required telemetryAllowed,
          }) async {
            calls.add('initialize:$signedIn:$pushAllowed:$telemetryAllowed');
            return nativeAllows;
          },
      telemetry: ({required enabled}) async => calls.add('telemetry:$enabled'),
      unregisterPush: () => cleanup(),
      deleteInstallation: () async {
        calls.add('delete-installation');
        if (failDeletion) throw StateError('synthetic deletion failure');
      },
    );
  });

  for (final platform in ['iOS', 'Android']) {
    test(
      '$platform signed out never initializes, even with stored Allow/push',
      () async {
        expect(
          await admission.update(
            signedIn: false,
            pushAllowed: true,
            telemetryAllowed: true,
          ),
          isFalse,
        );
        expect(calls, isEmpty);
      },
    );
    test(
      '$platform Deny and push OFF never initialize Installations',
      () async {
        expect(
          await admission.update(
            signedIn: true,
            pushAllowed: false,
            telemetryAllowed: false,
          ),
          isFalse,
        );
        expect(calls, isEmpty);
      },
    );
    test('$platform signed-in push admits FID without telemetry', () async {
      expect(
        await admission.update(
          signedIn: true,
          pushAllowed: true,
          telemetryAllowed: false,
        ),
        isTrue,
      );
      expect(calls, ['initialize:true:true:false', 'telemetry:false']);
    });
    test('$platform signed-in Allow admits FID without push', () async {
      expect(
        await admission.update(
          signedIn: true,
          pushAllowed: false,
          telemetryAllowed: true,
        ),
        isTrue,
      );
      expect(calls, ['initialize:true:false:true', 'telemetry:true']);
    });
  }

  test('withdraw waits for token/server cleanup before deleting FID', () async {
    await admission.update(
      signedIn: true,
      pushAllowed: true,
      telemetryAllowed: true,
    );
    calls.clear();
    final entered = Completer<void>();
    final drained = Completer<void>();
    cleanup = () async {
      calls.add('push-cleanup-start');
      entered.complete();
      await drained.future;
      calls.add('push-unregistered');
    };
    final withdrawing = admission.update(
      signedIn: true,
      pushAllowed: false,
      telemetryAllowed: false,
    );
    await entered.future;
    expect(calls, ['telemetry:false', 'push-cleanup-start']);
    drained.complete();
    await withdrawing;
    expect(calls, [
      'telemetry:false',
      'push-cleanup-start',
      'push-unregistered',
      'delete-installation',
    ]);
  });

  test('sign-out revokes even with both choices enabled', () async {
    await admission.update(
      signedIn: true,
      pushAllowed: true,
      telemetryAllowed: true,
    );
    calls.clear();
    await admission.update(
      signedIn: false,
      pushAllowed: true,
      telemetryAllowed: true,
    );
    expect(calls, [
      'telemetry:false',
      'push-unregistered',
      'delete-installation',
    ]);
  });

  test('native admission rejection revokes a previously active SDK', () async {
    await admission.update(
      signedIn: true,
      pushAllowed: true,
      telemetryAllowed: false,
    );
    calls.clear();
    nativeAllows = false;
    expect(
      await admission.update(
        signedIn: true,
        pushAllowed: true,
        telemetryAllowed: false,
      ),
      isFalse,
    );
    expect(calls, [
      'initialize:true:true:false',
      'telemetry:false',
      'push-unregistered',
      'delete-installation',
    ]);
  });

  test('push cleanup failure does not skip best-effort FID deletion', () async {
    await admission.update(
      signedIn: true,
      pushAllowed: true,
      telemetryAllowed: false,
    );
    calls.clear();
    cleanup = () async {
      calls.add('push-cleanup-failed');
      throw StateError('synthetic cleanup failure');
    };
    await admission.update(
      signedIn: true,
      pushAllowed: false,
      telemetryAllowed: false,
    );
    expect(calls, [
      'telemetry:false',
      'push-cleanup-failed',
      'delete-installation',
    ]);
  });

  test('deletion failure is best effort and a later denial retries', () async {
    await admission.update(
      signedIn: true,
      pushAllowed: false,
      telemetryAllowed: true,
    );
    calls.clear();
    failDeletion = true;
    await admission.update(
      signedIn: true,
      pushAllowed: false,
      telemetryAllowed: false,
    );
    failDeletion = false;
    await admission.update(
      signedIn: true,
      pushAllowed: false,
      telemetryAllowed: false,
    );
    expect(calls.where((c) => c == 'delete-installation'), hasLength(2));
  });
}
