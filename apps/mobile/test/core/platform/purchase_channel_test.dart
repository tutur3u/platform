import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/platform/purchase_channel.dart';
import 'package:mobile/core/router/link_browser_preference.dart';
import 'package:mobile/core/router/mobile_link_launcher.dart';
import 'package:mobile/features/assistant/widgets/assistant_document_link.dart';
import 'package:url_launcher/url_launcher.dart';

const _purchaseLinks = [
  'https://tuturuuu.com/en/pricing',
  'https://tuturuuu.com/pricing?plan=plus',
  'https://tuturuuu.com/en/ws-1/billing',
  'https://TUTURUUU.com/en/ws-1/Billing/success',
  'https://pay.tuturuuu.com/en/ws-1/billing',
  'https://pay.tuturuuu.com/',
  'https://workspace.tuturuuu.com/en/ws-1/billing',
  'https://tuturuuu.com/en/upgrade',
  'https://tuturuuu.com/en/ws-1/credits/top-up',
  'https://polar.sh/tuturuuu',
  'https://buy.polar.sh/checkout/abc',
];

const _ordinaryLinks = [
  'https://tuturuuu.com/en/ws-1/notes?noteId=1',
  'https://tuturuuu.com/account/delete',
  'https://tuturuuu.com/download',
  'https://tuturuuu.com/en/meet-together/plans/abc',
  'https://storefront.tuturuuu.com/en/shop/checkout',
  'https://inventory.tuturuuu.com/en/ws-1/checkout',
  'https://example.test/pricing',
  'https://nottuturuuu.com/billing',
  'mailto:billing@tuturuuu.com',
];

const List<TargetPlatform> _applePlatforms = [
  TargetPlatform.iOS,
  TargetPlatform.macOS,
];

void main() {
  tearDown(() => debugDefaultTargetPlatformOverride = null);

  test('Apple builds start no purchase; other platforms use the web', () {
    for (final platform in TargetPlatform.values) {
      expect(
        resolvePurchaseChannel(platform: platform),
        _applePlatforms.contains(platform)
            ? PurchaseChannel.unavailable
            : PurchaseChannel.external,
        reason: platform.name,
      );
    }
  });

  test('the Apple channel can become native without affecting others', () {
    for (final platform in TargetPlatform.values) {
      expect(
        resolvePurchaseChannel(
          platform: platform,
          appleChannel: PurchaseChannel.native,
        ),
        _applePlatforms.contains(platform)
            ? PurchaseChannel.native
            : PurchaseChannel.external,
        reason: platform.name,
      );
    }
  });

  test('follows the overridden target platform by default', () {
    debugDefaultTargetPlatformOverride = TargetPlatform.iOS;
    expect(resolvePurchaseChannel(), PurchaseChannel.unavailable);
    debugDefaultTargetPlatformOverride = TargetPlatform.macOS;
    expect(resolvePurchaseChannel(), PurchaseChannel.unavailable);
    debugDefaultTargetPlatformOverride = TargetPlatform.android;
    expect(resolvePurchaseChannel(), PurchaseChannel.external);
  });

  test('only the unavailable channel hides purchase entry points', () {
    expect(showsPurchaseEntryPoints(PurchaseChannel.external), isTrue);
    expect(showsPurchaseEntryPoints(PurchaseChannel.native), isTrue);
    expect(showsPurchaseEntryPoints(PurchaseChannel.unavailable), isFalse);
  });

  test('the native purchase hook starts nothing until a store is wired', () {
    expect(startNativePurchase('plus'), completion(isFalse));
  });

  test('recognizes Tuturuuu purchase pages and nothing else', () {
    for (final link in _purchaseLinks) {
      expect(isExternalPurchaseUri(Uri.parse(link)), isTrue, reason: link);
    }
    for (final link in _ordinaryLinks) {
      expect(isExternalPurchaseUri(Uri.parse(link)), isFalse, reason: link);
    }
  });

  test('external purchase pages open only on the external channel', () {
    final pricing = Uri.parse(_purchaseLinks.first);
    final notes = Uri.parse(_ordinaryLinks.first);
    for (final channel in PurchaseChannel.values) {
      expect(
        allowsPurchaseNavigation(pricing, channel: channel),
        channel == PurchaseChannel.external,
        reason: channel.name,
      );
      expect(allowsPurchaseNavigation(notes, channel: channel), isTrue);
    }
  });

  for (final (platform, opens) in [
    (TargetPlatform.iOS, false),
    (TargetPlatform.macOS, false),
    (TargetPlatform.android, true),
    (TargetPlatform.windows, true),
  ]) {
    test(
      'launchMobileLink on ${platform.name} opens pricing: $opens',
      () async {
        debugDefaultTargetPlatformOverride = platform;
        final launched = <Uri>[];
        Future<bool> launch(Uri uri, LaunchMode _) async {
          launched.add(uri);
          return true;
        }

        Future<LinkBrowserPreference> preference() async =>
            LinkBrowserPreference.external;

        for (final link in _purchaseLinks) {
          expect(
            await launchMobileLink(
              Uri.parse(link),
              launch: launch,
              readPreference: preference,
            ),
            opens,
            reason: link,
          );
        }
        final notes = Uri.parse(_ordinaryLinks.first);
        expect(
          await launchMobileLink(
            notes,
            launch: launch,
            readPreference: preference,
          ),
          isTrue,
        );
        expect(launched, [if (opens) ..._purchaseLinks.map(Uri.parse), notes]);
      },
    );
  }

  test('assistant documents never resolve to purchase pages on Apple', () {
    for (final platform in _applePlatforms) {
      debugDefaultTargetPlatformOverride = platform;
      expect(assistantDocumentUri(_purchaseLinks.first), isNull);
      expect(assistantDocumentUri(_ordinaryLinks.first), isNotNull);
    }
    debugDefaultTargetPlatformOverride = TargetPlatform.android;
    expect(assistantDocumentUri(_purchaseLinks.first), isNotNull);
  });
}
