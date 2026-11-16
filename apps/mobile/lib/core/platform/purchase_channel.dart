import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';

/// How a build may let someone buy a plan, credits or a subscription.
///
/// App Store Guidelines 3.1.1 and 3.1.3 forbid the iOS and Mac App Store
/// builds from linking to a purchase made outside StoreKit, so those builds
/// never use [external]. Paid entitlements a user already holds stay usable
/// on every channel; the channel only decides how a new purchase starts.
enum PurchaseChannel {
  /// Purchases open the Tuturuuu web billing pages.
  external,

  /// Purchases run through the platform store via [NativePurchaseLauncher].
  native,

  /// No purchase can start here: purchase entry points are hidden.
  unavailable,
}

/// Whether the platform store can sell right now: the server verified store
/// purchases for this build and the store returned the products.
abstract interface class NativePurchaseAvailability {
  /// The last known answer, read synchronously for the first frame.
  /// Report false until availability is verified.
  bool get isAvailable;

  /// Emits whenever [isAvailable] changes. Must be a broadcast stream: every
  /// purchase entry point listens to it.
  Stream<bool> get changes;
}

/// Store purchases are never available. The default until a store
/// integration provides a verified implementation.
final class UnavailableNativePurchaseAvailability
    implements NativePurchaseAvailability {
  const UnavailableNativePurchaseAvailability();

  @override
  bool get isAvailable => false;

  @override
  Stream<bool> get changes => const Stream<bool>.empty();
}

/// Starts a platform store purchase. Only reached on [PurchaseChannel.native].
abstract interface class NativePurchaseLauncher {
  /// Buys [productKey], the plan or credit pack; returns whether the purchase
  /// completed.
  Future<bool> launch(String productKey);
}

/// Starts nothing. The default until a store integration replaces it.
final class NoopNativePurchaseLauncher implements NativePurchaseLauncher {
  const NoopNativePurchaseLauncher();

  @override
  Future<bool> launch(String productKey) async => false;
}

/// Whether [platform] (default: the running target) ships through the App
/// Store, where external purchases are never offered.
bool isAppStorePlatform({TargetPlatform? platform}) {
  if (kIsWeb && platform == null) return false;
  final target = platform ?? defaultTargetPlatform;
  return target == TargetPlatform.iOS || target == TargetPlatform.macOS;
}

/// Resolves the channel from the platform and store availability. The
/// platform alone never selects [PurchaseChannel.native].
PurchaseChannel resolvePurchaseChannel({
  required bool nativeAvailable,
  TargetPlatform? platform,
}) {
  if (!isAppStorePlatform(platform: platform)) return PurchaseChannel.external;
  return nativeAvailable ? PurchaseChannel.native : PurchaseChannel.unavailable;
}

/// Provides store availability and the purchase launcher to a subtree. Without
/// a scope, store purchases are unavailable and the launcher starts nothing.
class PurchaseScope extends InheritedWidget {
  const PurchaseScope({
    required super.child,
    this.availability = const UnavailableNativePurchaseAvailability(),
    this.launcher = const NoopNativePurchaseLauncher(),
    super.key,
  });

  final NativePurchaseAvailability availability;
  final NativePurchaseLauncher launcher;

  static const _fallback = PurchaseScope(child: SizedBox.shrink());

  /// The nearest scope, or the unavailable defaults.
  static PurchaseScope of(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<PurchaseScope>() ?? _fallback;

  @override
  bool updateShouldNotify(PurchaseScope oldWidget) =>
      availability != oldWidget.availability || launcher != oldWidget.launcher;
}
