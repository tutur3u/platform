import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/shell/view/shell_route_motion.dart';

import 'shell_route_transition_harness.dart';

const _checkpoints = [0, 70, 140, 220];

/// Pumps zero-length frames until the router has started the transition;
/// route matching completes asynchronously.
Future<void> _startTransition(WidgetTester tester) async {
  for (var i = 0; i < 10; i++) {
    await tester.pump();
    if (harnessShell(tester).controller.active) return;
  }
  fail('no route transition started');
}

/// Pumps to each checkpoint of a 220ms transition, calling [check] with the
/// elapsed milliseconds.
Future<void> _walkTimeline(
  WidgetTester tester,
  double Function(int ms) nominal,
  void Function(int ms, double v) check,
) async {
  await _startTransition(tester);
  var elapsed = 0;
  for (final ms in _checkpoints) {
    if (ms > elapsed) await tester.pump(Duration(milliseconds: ms - elapsed));
    elapsed = ms;
    // The route's own value, within a frame-clock tick of the nominal one.
    final controller = harnessShell(tester).controller;
    final v = controller.active ? controller.animation.value : nominal(ms);
    expect(v, closeTo(nominal(ms), 2e-3), reason: 'timeline at ${ms}ms');
    check(ms, v);
  }
}

void _expectOpacity(double actual, double expected, String reason) =>
    expect(actual, closeTo(expected, 1e-6), reason: reason);

void main() {
  testWidgets('push slides only the body; dock geometry never changes', (
    tester,
  ) async {
    final router = await pumpRouteHarness(tester);
    final before = dockGeometry(tester);
    final bodyX = <int, double>{};
    unawaited(router.push(messageLocation));
    await _walkTimeline(tester, (ms) => ms / 220, (ms, v) {
      expect(dockGeometry(tester), before, reason: 'dock at ${ms}ms');
      bodyX[ms] = tester.getTopLeft(find.text(bodyLabel(messageLocation))).dx;
      // The outgoing layers stay until the frame after the timeline ends.
      _expectOpacity(
        layerOpacity(tester, titleOf(inboxLocation)),
        ShellRouteMotion.titleExitOpacity(v),
        'outgoing title at ${ms}ms',
      );
      _expectOpacity(
        layerOpacity(tester, find.text('Mailbox')),
        ShellRouteMotion.contentExitOpacity(v),
        'outgoing dock contents at ${ms}ms',
      );
      _expectOpacity(
        layerOpacity(tester, titleOf(messageLocation)),
        ShellRouteMotion.titleEnterOpacity(v),
        'incoming title at ${ms}ms',
      );
      _expectOpacity(
        layerOpacity(tester, find.text('Reply')),
        ShellRouteMotion.contentEnterOpacity(v),
        'incoming action group at ${ms}ms',
      );
    });
    // The body moves from the end edge to rest with the emphasized curve.
    expect(bodyX[0], 390);
    expect(bodyX[70], lessThan(bodyX[0]!));
    expect(bodyX[140], lessThan(bodyX[70]!));
    expect(bodyX[220], 0);
    await tester.pumpAndSettle();
    expect(dockGeometry(tester), before);
    expect(tester.takeException(), isNull);
  });

  testWidgets('pop runs the same timeline in reverse', (tester) async {
    final router = await pumpRouteHarness(tester);
    unawaited(router.push(messageLocation));
    await tester.pumpAndSettle();
    final before = dockGeometry(tester);
    router.pop();
    await _walkTimeline(tester, (ms) => 1 - ms / 220, (ms, v) {
      expect(dockGeometry(tester), before, reason: 'dock at ${ms}ms');
      if (ms < 220) {
        _expectOpacity(
          layerOpacity(tester, titleOf(messageLocation)),
          ShellRouteMotion.titleEnterOpacity(v),
          'leaving title at ${ms}ms',
        );
        _expectOpacity(
          layerOpacity(tester, find.text('Reply')),
          ShellRouteMotion.contentEnterOpacity(v),
          'leaving action group at ${ms}ms',
        );
      }
      _expectOpacity(
        layerOpacity(tester, titleOf(inboxLocation)),
        ShellRouteMotion.titleExitOpacity(v),
        'revealed title at ${ms}ms',
      );
      _expectOpacity(
        layerOpacity(tester, find.text('Mailbox')),
        ShellRouteMotion.contentExitOpacity(v),
        'revealed dock contents at ${ms}ms',
      );
    });
    await tester.pumpAndSettle();
    expect(titleOf(messageLocation), findsNothing);
    expect(find.text('Reply'), findsNothing);
    expect(dockGeometry(tester), before);
    expect(tester.takeException(), isNull);
  });

  testWidgets('equal dock contents stay in place without a fade', (
    tester,
  ) async {
    final router = await pumpRouteHarness(tester);
    router.go(settingsLocation);
    await tester.pumpAndSettle();
    final before = dockGeometry(tester);
    final contents = tester.element(find.text('General'));
    unawaited(router.push(aboutLocation));
    await _walkTimeline(tester, (ms) => ms / 220, (ms, v) {
      expect(find.text('General'), findsOneWidget, reason: 'at ${ms}ms');
      expect(tester.element(find.text('General')), same(contents));
      _expectOpacity(
        layerOpacity(tester, find.text('General')),
        1,
        'dock contents at ${ms}ms',
      );
      expect(dockGeometry(tester), before, reason: 'dock at ${ms}ms');
    });
    await tester.pumpAndSettle();
    expect(tester.element(find.text('General')), same(contents));
    expect(tester.takeException(), isNull);
  });

  testWidgets('the circle keeps its material while only its icon swaps', (
    tester,
  ) async {
    final router = await pumpRouteHarness(tester);
    final circle = find.descendant(
      of: find.byKey(primaryTransition),
      matching: find.byType(FilledButton),
    );
    unawaited(router.push(messageLocation));
    await _startTransition(tester);
    await tester.pump(const Duration(milliseconds: 45));
    expect(circle, findsOneWidget);
    expect(
      iconOpacity(tester, find.byIcon(Icons.edit_outlined)),
      closeTo(ShellRouteMotion.contentExitOpacity(45 / 220), 1e-6),
    );
    expect(iconOpacity(tester, find.byIcon(Icons.archive_outlined)), 0);
    await tester.pump(const Duration(milliseconds: 115));
    expect(circle, findsOneWidget);
    expect(
      iconOpacity(tester, find.byIcon(Icons.archive_outlined)),
      closeTo(ShellRouteMotion.contentEnterOpacity(160 / 220), 1e-6),
    );
    await tester.pumpAndSettle();
    expect(find.byIcon(Icons.edit_outlined), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('reduced motion cross-fades everything in 100ms', (tester) async {
    final router = await pumpRouteHarness(tester, reduceMotion: true);
    final before = dockGeometry(tester);
    unawaited(router.push(messageLocation));
    await _startTransition(tester);
    await tester.pump(const Duration(milliseconds: 50));
    expect(tester.getTopLeft(find.text(bodyLabel(messageLocation))).dx, 0);
    expect(dockGeometry(tester), before);
    for (final (finder, expected) in [
      (titleOf(messageLocation), .5),
      (titleOf(inboxLocation), .5),
      (find.text('Reply'), .5),
      (find.text('Mailbox'), .5),
    ]) {
      expect(layerOpacity(tester, finder), closeTo(expected, 1e-6));
    }
    await tester.pump(const Duration(milliseconds: 50));
    expect(layerOpacity(tester, titleOf(messageLocation)), 1);
    expect(layerOpacity(tester, titleOf(inboxLocation)), 0);
    expect(layerOpacity(tester, find.text('Mailbox')), 0);
    await tester.pump(const Duration(milliseconds: 1));
    expect(titleOf(inboxLocation), findsNothing);
    expect(find.text('Mailbox'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('a back-swipe scrubs title and dock contents with the finger', (
    tester,
  ) async {
    final router = await pumpRouteHarness(tester, platform: TargetPlatform.iOS);
    unawaited(router.push(messageLocation));
    await tester.pumpAndSettle();
    final before = dockGeometry(tester);
    final gesture = await tester.startGesture(const Offset(4, 400));
    await gesture.moveBy(const Offset(40, 0));
    await tester.pump();
    await gesture.moveBy(const Offset(155, 0));
    await tester.pump();
    final v = harnessShell(tester).controller.animation.value;
    expect(v, inInclusiveRange(.4, .6));
    for (final (finder, expected) in [
      (titleOf(messageLocation), ShellRouteMotion.titleEnterOpacity(v)),
      (titleOf(inboxLocation), ShellRouteMotion.titleExitOpacity(v)),
      (find.text('Reply'), ShellRouteMotion.contentEnterOpacity(v)),
      (find.text('Mailbox'), ShellRouteMotion.contentExitOpacity(v)),
    ]) {
      expect(layerOpacity(tester, finder), closeTo(expected, 1e-6));
    }
    final top = layerOpacity(tester, titleOf(messageLocation));
    expect(top, greaterThan(0));
    expect(top, lessThan(1));
    expect(dockGeometry(tester), before);
    // Lifting the finger past the middle completes the pop.
    await gesture.moveBy(const Offset(60, 0));
    await gesture.up();
    await tester.pumpAndSettle();
    expect(titleOf(inboxLocation), findsOneWidget);
    expect(titleOf(messageLocation), findsNothing);
    expect(dockGeometry(tester), before);
    expect(tester.takeException(), isNull);
  });

  testWidgets('Back to a replaced page runs a pop', (tester) async {
    final arrivedBack = ValueNotifier(false);
    addTearDown(arrivedBack.dispose);
    final router = await pumpRouteHarness(tester, arrivedBack: arrivedBack);
    router.go(replacedLocation);
    await tester.pumpAndSettle();
    final before = dockGeometry(tester);
    arrivedBack.value = true;
    router.go(inboxLocation);
    final leaving = <double>[];
    await _walkTimeline(tester, (ms) => 1 - ms / 220, (ms, v) {
      expect(dockGeometry(tester), before, reason: 'dock at ${ms}ms');
      _expectOpacity(
        layerOpacity(tester, titleOf(inboxLocation)),
        ShellRouteMotion.titleExitOpacity(v),
        'revealed title at ${ms}ms',
      );
      if (ms < 220) {
        _expectOpacity(
          layerOpacity(tester, titleOf(replacedLocation)),
          ShellRouteMotion.titleEnterOpacity(v),
          'leaving title at ${ms}ms',
        );
        leaving.add(
          tester.getTopLeft(find.text(bodyLabel(replacedLocation))).dx,
        );
      }
    });
    // The replaced page leaves towards the end edge like a popped one.
    expect(leaving.first, 0);
    expect(leaving.last, greaterThan(leaving.first));
    await tester.pumpAndSettle();
    expect(find.text(bodyLabel(replacedLocation)), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('a swipe after a Back arrival is an ordinary pop', (
    tester,
  ) async {
    final arrivedBack = ValueNotifier(false);
    addTearDown(arrivedBack.dispose);
    final router = await pumpRouteHarness(
      tester,
      platform: TargetPlatform.iOS,
      arrivedBack: arrivedBack,
    );
    router.go(replacedLocation);
    await tester.pumpAndSettle();
    arrivedBack.value = true;
    router.go(messageLocation);
    await tester.pumpAndSettle();
    final gesture = await tester.startGesture(const Offset(4, 400));
    await gesture.moveBy(const Offset(40, 0));
    await tester.pump();
    await gesture.moveBy(const Offset(100, 0));
    await tester.pump();
    final controller = harnessShell(tester).controller;
    // The message route is the upper one and the body follows the finger.
    expect(controller.topLocation, messageLocation);
    expect(controller.belowLocation, inboxLocation);
    expect(
      tester.getTopLeft(find.text(bodyLabel(messageLocation))).dx,
      greaterThan(0),
    );
    await gesture.moveBy(const Offset(-140, 0));
    await gesture.up();
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  });

  testWidgets('a swipe shows no retained layer for a page not below', (
    tester,
  ) async {
    final router = await pumpRouteHarness(tester, platform: TargetPlatform.iOS);
    router.go(settingsLocation);
    await tester.pumpAndSettle();
    // Opens the message over a freshly built inbox, so the retained title
    // (Settings) is not the page below.
    router.go(messageLocation);
    await tester.pumpAndSettle();
    final gesture = await tester.startGesture(const Offset(4, 400));
    await gesture.moveBy(const Offset(40, 0));
    await tester.pump();
    await gesture.moveBy(const Offset(155, 0));
    await tester.pump();
    await tester.pump();
    expect(harnessShell(tester).controller.active, isTrue);
    expect(titleOf(settingsLocation), findsNothing);
    expect(layerOpacity(tester, titleOf(messageLocation)), 1);
    await gesture.moveBy(const Offset(-195, 0));
    await gesture.up();
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  });

  testWidgets('frames retarget animations without rebuilding the dock', (
    tester,
  ) async {
    final router = await pumpRouteHarness(tester);
    unawaited(router.push(settingsLocation));
    await tester.pumpAndSettle();
    // One untimed push and pop first, so first-use compilation in the debug
    // test VM is not counted as transition cost.
    unawaited(router.push(aboutLocation));
    await tester.pumpAndSettle();
    router.pop();
    await tester.pumpAndSettle();
    unawaited(router.push(aboutLocation));
    await _startTransition(tester);
    final builds = Map.of(dockContentBuilds);
    final frames = <int>[];
    for (var i = 0; i < 14; i++) {
      final watch = Stopwatch()..start();
      await tester.pump(const Duration(milliseconds: 16));
      frames.add(watch.elapsedMicroseconds);
    }
    await tester.pumpAndSettle();
    // The last frame drops the retained layer; no other frame builds the
    // dock contents again.
    expect(dockContentBuilds[settingsLocation], builds[settingsLocation]);
    expect(
      dockContentBuilds[aboutLocation]! - builds[aboutLocation]!,
      lessThanOrEqualTo(1),
    );
    frames.sort();
    final total = frames.fold<int>(0, (sum, us) => sum + us);
    // Harness frame cost (build, layout, paint) during the transition.
    debugPrint(
      'shell-route-frame-timing: frames=${frames.length} '
      'median=${frames[frames.length ~/ 2]}us max=${frames.last}us '
      'mean=${total ~/ frames.length}us',
    );
    expect(tester.takeException(), isNull);
  });
}
