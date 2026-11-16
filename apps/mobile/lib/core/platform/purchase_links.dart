import 'package:flutter/foundation.dart';
import 'package:mobile/core/platform/purchase_channel.dart';

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

/// Whether the app may open [uri]. App Store builds never open an external
/// purchase page, whether or not store purchases are available; every other
/// link is unaffected.
bool allowsPurchaseNavigation(Uri uri, {TargetPlatform? platform}) =>
    !isAppStorePlatform(platform: platform) || !isExternalPurchaseUri(uri);
