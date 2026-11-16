import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/platform/purchase_channel.dart';
import 'package:mobile/core/platform/purchase_entry_point.dart';

final class _Availability implements NativePurchaseAvailability {
  _Availability({this.isAvailable = false});

  final _controller = StreamController<bool>.broadcast();

  @override
  bool isAvailable;

  @override
  Stream<bool> get changes => _controller.stream;

  void set({required bool available}) {
    isAvailable = available;
    _controller.add(available);
  }

  Future<void> close() => _controller.close();
}

final class _Launcher implements NativePurchaseLauncher {
  final launched = <String>[];

  @override
  Future<bool> launch(String productKey) async {
    launched.add(productKey);
    return true;
  }
}

const _ctaKey = Key('upgrade-cta');

Widget _entryPoint({
  NativePurchaseAvailability? availability,
  NativePurchaseLauncher? launcher,
  List<PurchaseChannel>? channels,
}) {
  final entryPoint = PurchaseEntryPoint(
    builder: (context, channel, launcher) {
      channels?.add(channel);
      return GestureDetector(
        key: _ctaKey,
        behavior: HitTestBehavior.opaque,
        onTap: () => unawaited(launcher.launch('plus')),
        child: const SizedBox.square(dimension: 40),
      );
    },
  );
  return Directionality(
    textDirection: TextDirection.ltr,
    child: availability == null
        ? entryPoint
        : PurchaseScope(
            availability: availability,
            launcher: launcher ?? const NoopNativePurchaseLauncher(),
            child: entryPoint,
          ),
  );
}

const _apple = TargetPlatformVariant({
  TargetPlatform.iOS,
  TargetPlatform.macOS,
});
const _external = TargetPlatformVariant({
  TargetPlatform.android,
  TargetPlatform.windows,
});

void main() {
  testWidgets('App Store builds hide the CTA without a purchase scope', (
    tester,
  ) async {
    await tester.pumpWidget(_entryPoint());
    expect(find.byKey(_ctaKey), findsNothing);
  }, variant: _apple);

  testWidgets(
    'App Store builds show the CTA only after availability resolves',
    (tester) async {
      final availability = _Availability();
      addTearDown(availability.close);
      final launcher = _Launcher();
      final channels = <PurchaseChannel>[];
      await tester.pumpWidget(
        _entryPoint(
          availability: availability,
          launcher: launcher,
          channels: channels,
        ),
      );
      expect(find.byKey(_ctaKey), findsNothing);

      availability.set(available: true);
      await tester.pump();
      await tester.pump();
      expect(find.byKey(_ctaKey), findsOneWidget);
      expect(channels.toSet(), {PurchaseChannel.native});
      await tester.tap(find.byKey(_ctaKey));
      expect(launcher.launched, ['plus']);

      availability.set(available: false);
      await tester.pump();
      await tester.pump();
      expect(find.byKey(_ctaKey), findsNothing);
    },
    variant: _apple,
  );

  testWidgets('a verified first frame shows the native CTA at once', (
    tester,
  ) async {
    final availability = _Availability(isAvailable: true);
    addTearDown(availability.close);
    await tester.pumpWidget(_entryPoint(availability: availability));
    expect(find.byKey(_ctaKey), findsOneWidget);
  }, variant: _apple);

  testWidgets('other platforms keep the external CTA regardless of store', (
    tester,
  ) async {
    final availability = _Availability();
    addTearDown(availability.close);
    final launcher = _Launcher();
    final channels = <PurchaseChannel>[];
    await tester.pumpWidget(
      _entryPoint(
        availability: availability,
        launcher: launcher,
        channels: channels,
      ),
    );
    expect(find.byKey(_ctaKey), findsOneWidget);
    expect(channels.toSet(), {PurchaseChannel.external});
    await tester.pumpWidget(_entryPoint(channels: channels));
    expect(find.byKey(_ctaKey), findsOneWidget);
  }, variant: _external);
}
