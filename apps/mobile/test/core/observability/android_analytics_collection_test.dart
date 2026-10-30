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

  test(
    'app_open is dispatched once across re-apply and consent toggles',
    () async {
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

      verify(() => analytics.logAppOpen()).called(1);
      expect(persistedEnabled, isTrue);
    },
  );

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
