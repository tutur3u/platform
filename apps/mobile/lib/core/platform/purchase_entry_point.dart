import 'package:flutter/widgets.dart';
import 'package:mobile/core/platform/purchase_channel.dart';

/// Builds an upgrade, plan or credits call to action for [channel]. On
/// [PurchaseChannel.native], start the purchase with [launcher].
typedef PurchaseEntryPointBuilder =
    Widget Function(
      BuildContext context,
      PurchaseChannel channel,
      NativePurchaseLauncher launcher,
    );

/// Shows a purchase call to action only where a purchase can start.
///
/// The first frame uses the synchronous
/// [NativePurchaseAvailability.isAvailable] answer, then follows
/// [NativePurchaseAvailability.changes]. On iOS and macOS
/// the call to action stays hidden until availability resolves to true.
class PurchaseEntryPoint extends StatelessWidget {
  const PurchaseEntryPoint({
    required this.builder,
    this.platform,
    this.placeholder = const SizedBox.shrink(),
    super.key,
  });

  final PurchaseEntryPointBuilder builder;

  /// Shown while no purchase can start.
  final Widget placeholder;

  /// Overrides the running target, for tests.
  final TargetPlatform? platform;

  @override
  Widget build(BuildContext context) {
    if (!isAppStorePlatform(platform: platform)) {
      return builder(
        context,
        PurchaseChannel.external,
        PurchaseScope.of(context).launcher,
      );
    }
    final scope = PurchaseScope.of(context);
    return StreamBuilder<bool>(
      stream: scope.availability.changes,
      initialData: scope.availability.isAvailable,
      builder: (context, snapshot) {
        final channel = resolvePurchaseChannel(
          nativeAvailable: snapshot.data ?? false,
          platform: platform,
        );
        return channel == PurchaseChannel.native
            ? builder(context, channel, scope.launcher)
            : placeholder;
      },
    );
  }
}
