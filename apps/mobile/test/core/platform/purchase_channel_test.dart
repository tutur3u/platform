import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/platform/purchase_channel.dart';

const List<TargetPlatform> _applePlatforms = [
  TargetPlatform.iOS,
  TargetPlatform.macOS,
];

void main() {
  tearDown(() => debugDefaultTargetPlatformOverride = null);

  for (final nativeAvailable in [false, true]) {
    test('resolves every platform with native available: $nativeAvailable', () {
      for (final platform in TargetPlatform.values) {
        final expected = !_applePlatforms.contains(platform)
            ? PurchaseChannel.external
            : nativeAvailable
            ? PurchaseChannel.native
            : PurchaseChannel.unavailable;
        expect(
          resolvePurchaseChannel(
            nativeAvailable: nativeAvailable,
            platform: platform,
          ),
          expected,
          reason: platform.name,
        );
      }
    });
  }

  test('follows the overridden target platform by default', () {
    debugDefaultTargetPlatformOverride = TargetPlatform.iOS;
    expect(isAppStorePlatform(), isTrue);
    expect(
      resolvePurchaseChannel(nativeAvailable: false),
      PurchaseChannel.unavailable,
    );
    debugDefaultTargetPlatformOverride = TargetPlatform.macOS;
    expect(isAppStorePlatform(), isTrue);
    debugDefaultTargetPlatformOverride = TargetPlatform.android;
    expect(isAppStorePlatform(), isFalse);
    expect(
      resolvePurchaseChannel(nativeAvailable: true),
      PurchaseChannel.external,
    );
  });

  test('defaults report store purchases unavailable and start nothing', () {
    const availability = UnavailableNativePurchaseAvailability();
    expect(availability.isAvailable, isFalse);
    expect(availability.changes, emitsDone);
    expect(
      const NoopNativePurchaseLauncher().launch('plus'),
      completion(isFalse),
    );
  });
}
