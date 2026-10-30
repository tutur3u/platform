import 'dart:async';

import 'package:firebase_analytics/firebase_analytics.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/observability/android_analytics_collection.dart';
import 'package:mocktail/mocktail.dart';

class _Analytics extends Mock implements FirebaseAnalytics {}

void main() {
  late _Analytics analytics;
  late List<String> calls;
  late bool signedIn;
  late bool consent;
  late bool persistedEnabled;
  late AndroidAnalyticsCollection controller;

  setUp(() {
    analytics = _Analytics();
    calls = [];
    signedIn = false;
    consent = false;
    persistedEnabled = false;
    when(() => analytics.setAnalyticsCollectionEnabled(any())).thenAnswer((
      call,
    ) async {
      final enabled = call.positionalArguments.first as bool;
      calls.add('plugin:$enabled');
      persistedEnabled = enabled;
    });
    when(() => analytics.logAppOpen()).thenAnswer((_) async {
      calls.add('app_open');
    });
    controller = AndroidAnalyticsCollection(
      configureNative: ({required enabled}) async {
        final admitted = enabled && signedIn && consent;
        if (admitted) {
          calls.add('components:true');
        } else {
          persistedEnabled = false;
          calls
            ..add('persist:false')
            ..add('components:false');
        }
        return admitted;
      },
      analytics: () {
        calls.add('lazy-plugin');
        return analytics;
      },
    );
  });

  test(
    'in-session Allow enables components, lazy plugin, collection and event',
    () async {
      signedIn = true;
      await controller.apply(enabled: false);
      calls.clear();
      consent = true;

      await controller.apply(enabled: true);

      expect(calls, [
        'components:true',
        'lazy-plugin',
        'plugin:true',
        'app_open',
      ]);
      expect(persistedEnabled, isTrue);
    },
  );

  test('app_open is dispatched once per Allow, never per re-apply', () async {
    signedIn = true;
    consent = true;
    await controller.apply(enabled: true);
    await controller.apply(enabled: true);

    consent = false;
    await controller.apply(enabled: false);
    expect(persistedEnabled, isFalse);

    consent = true;
    await controller.apply(enabled: true);
    await controller.apply(enabled: true);

    verify(() => analytics.logAppOpen()).called(2);
    expect(persistedEnabled, isTrue);
  });

  for (final coldStart in [false, true]) {
    test('first event survives the disabled-component cache '
        '(cold start: $coldStart)', () async {
      // Measurement 23.2.0 zzic.zzH caches upload capability as false for
      // 1000 ms; zzlj.zzG silently discards events while that cache is valid.
      // A push-only Firebase initialization can seed this before Allow.
      signedIn = true;
      consent = true;
      var uploadAvailable = false;
      Timer? availabilityTimer;
      when(() => analytics.setAnalyticsCollectionEnabled(true)).thenAnswer((
        _,
      ) async {
        calls.add('plugin:true');
        persistedEnabled = true;
        availabilityTimer = Timer(const Duration(milliseconds: 1000), () {
          uploadAvailable = true;
        });
      });
      when(() => analytics.logAppOpen()).thenAnswer((_) async {
        calls.add(uploadAvailable ? 'app_open' : 'dropped');
      });
      if (!coldStart) await controller.apply(enabled: false);
      calls.clear();

      try {
        await controller.apply(enabled: true);
      } finally {
        availabilityTimer?.cancel();
      }

      expect(persistedEnabled, isTrue);
      expect(calls, [
        'components:true',
        'lazy-plugin',
        'plugin:true',
        'app_open',
      ]);
      verify(() => analytics.logAppOpen()).called(1);
    });
  }

  test('withdraw during startup settling emits nothing', () async {
    signedIn = true;
    consent = true;
    final enabling = Completer<void>();
    when(() => analytics.setAnalyticsCollectionEnabled(true)).thenAnswer((
      _,
    ) async {
      persistedEnabled = true;
      enabling.complete();
    });
    final starting = controller.apply(enabled: true);
    await enabling.future;
    consent = false;
    final stopping = controller.apply(enabled: false);
    await Future.wait([starting, stopping]);
    verifyNever(() => analytics.logAppOpen());
    expect(persistedEnabled, isFalse);
    expect(calls.last, 'components:false');
  });

  test('cold signed-in Allow starts in the same session', () async {
    // Native process startup has reset the old persisted true unconditionally.
    persistedEnabled = false;
    signedIn = true;
    consent = true;

    await controller.apply(enabled: true);

    expect(calls, [
      'components:true',
      'lazy-plugin',
      'plugin:true',
      'app_open',
    ]);
    expect(persistedEnabled, isTrue);
  });

  test(
    'cold stored Allow while signed out never creates or calls plugin',
    () async {
      consent = true;
      await controller.apply(enabled: true);
      expect(calls, isNot(contains('lazy-plugin')));
      verifyNever(() => analytics.setAnalyticsCollectionEnabled(any()));
      verifyNever(() => analytics.logAppOpen());
      expect(persistedEnabled, isFalse);

      calls.clear();
      signedIn = true;
      await controller.apply(enabled: true);
      expect(calls, [
        'components:true',
        'lazy-plugin',
        'plugin:true',
        'app_open',
      ]);
    },
  );

  test('signed-in Deny keeps the plugin dormant', () async {
    signedIn = true;
    await controller.apply(enabled: true);
    expect(calls, [
      'persist:false',
      'components:false',
      'persist:false',
      'components:false',
    ]);
    verifyNever(() => analytics.logAppOpen());
    expect(persistedEnabled, isFalse);
  });

  test(
    'withdraw disables plugin, persists false, then disables components',
    () async {
      signedIn = true;
      consent = true;
      await controller.apply(enabled: true);
      calls.clear();
      consent = false;

      await controller.apply(enabled: false);

      expect(calls, ['plugin:false', 'persist:false', 'components:false']);
      expect(persistedEnabled, isFalse);
    },
  );

  test('withdraw fences an Allow still waiting for native admission', () async {
    final admitted = Completer<bool>();
    final entered = Completer<void>();
    controller = AndroidAnalyticsCollection(
      configureNative: ({required enabled}) {
        if (enabled) {
          entered.complete();
          return admitted.future;
        }
        calls
          ..add('persist:false')
          ..add('components:false');
        return Future.value(false);
      },
      analytics: () {
        calls.add('lazy-plugin');
        return analytics;
      },
    );
    final starting = controller.apply(enabled: true);
    await entered.future;
    final stopping = controller.apply(enabled: false);
    admitted.complete(true);
    await Future.wait([starting, stopping]);
    expect(calls, ['persist:false', 'components:false']);
    verifyNever(() => analytics.logAppOpen());
  });

  test('failed lazy instance creation closes native admission', () async {
    controller = AndroidAnalyticsCollection(
      configureNative: ({required enabled}) async {
        calls.add('components:$enabled');
        return enabled;
      },
      analytics: () => throw StateError('synthetic factory failure'),
    );
    await expectLater(controller.apply(enabled: true), throwsStateError);
    expect(calls, ['components:true', 'components:false']);
  });

  test('failed plugin start revokes the native admission', () async {
    signedIn = true;
    consent = true;
    when(
      () => analytics.logAppOpen(),
    ).thenThrow(StateError('synthetic failure'));

    await expectLater(controller.apply(enabled: true), throwsStateError);

    expect(calls, [
      'components:true',
      'lazy-plugin',
      'plugin:true',
      'plugin:false',
      'persist:false',
      'components:false',
    ]);
    expect(persistedEnabled, isFalse);
  });
}
