import 'package:flutter/foundation.dart';

/// How a build may let someone buy a plan, credits or a subscription.
///
/// App Store Guidelines 3.1.1 and 3.1.3 forbid the iOS and Mac App Store
/// builds from linking to a purchase made outside StoreKit, so those builds
/// never use [external]. Paid entitlements a user already holds stay usable
/// on every channel; the channel only decides how a new purchase starts.
enum PurchaseChannel {
  /// Purchases open the Tuturuuu web billing pages.
  external,

  /// Purchases run through the platform store via [startNativePurchase].
  native,

  /// No purchase can start here: upgrade entry points are hidden.
  unavailable,
}

/// The channel for App Store builds. StoreKit purchases are not wired yet, so
/// iOS and macOS start no purchase until this becomes [PurchaseChannel.native].
const PurchaseChannel appleStorePurchaseChannel = PurchaseChannel.unavailable;

/// Resolves the channel for [platform], defaulting to the running target.
///
/// Widget tests select a platform with `debugDefaultTargetPlatformOverride` or
/// `TargetPlatformVariant`; [appleChannel] lets tests exercise the native path.
PurchaseChannel resolvePurchaseChannel({
  TargetPlatform? platform,
  PurchaseChannel appleChannel = appleStorePurchaseChannel,
}) {
  if (kIsWeb && platform == null) return PurchaseChannel.external;
  return switch (platform ?? defaultTargetPlatform) {
    TargetPlatform.iOS || TargetPlatform.macOS => appleChannel,
    _ => PurchaseChannel.external,
  };
}

/// Whether an upgrade, plan or credits call to action may be shown.
bool showsPurchaseEntryPoints(PurchaseChannel channel) =>
    channel != PurchaseChannel.unavailable;

/// A store purchase request. [productKey] names the plan or credit pack.
typedef NativePurchaseHook = Future<bool> Function(String productKey);

/// Starts a store purchase on the [PurchaseChannel.native] channel. It returns
/// false until a store integration replaces it.
NativePurchaseHook startNativePurchase = (_) async => false;

const _firstPartyHost = 'tuturuuu.com';

/// First-party path segments that sell plans, credits or subscriptions.
/// Storefront and inventory checkouts sell a workspace's own goods and are
/// not Tuturuuu purchases, so `checkout` is not matched.
const _purchaseSegments = {
  'billing',
  'pricing',
  'upgrade',
  'subscribe',
  'subscription',
  'subscriptions',
  'top-up',
  'topup',
};

/// Hosts whose every page belongs to a Tuturuuu purchase flow.
const _purchaseHosts = {'pay.$_firstPartyHost', 'polar.sh'};

/// Whether [uri] opens a Tuturuuu plan, credit or subscription purchase page.
bool isExternalPurchaseUri(Uri uri) {
  final scheme = uri.scheme.toLowerCase();
  if (scheme != 'https' && scheme != 'http') return false;
  final host = uri.host.toLowerCase();
  if (host.isEmpty) return false;
  for (final purchaseHost in _purchaseHosts) {
    if (host == purchaseHost || host.endsWith('.$purchaseHost')) return true;
  }
  final firstParty =
      host == _firstPartyHost || host.endsWith('.$_firstPartyHost');
  if (!firstParty) return false;
  return uri.pathSegments.any(
    (segment) => _purchaseSegments.contains(segment.toLowerCase()),
  );
}

/// Whether the app may open [uri]. External purchase pages open only on the
/// [PurchaseChannel.external] channel; every other link is unaffected.
bool allowsPurchaseNavigation(Uri uri, {PurchaseChannel? channel}) =>
    (channel ?? resolvePurchaseChannel()) == PurchaseChannel.external ||
    !isExternalPurchaseUri(uri);
