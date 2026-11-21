import 'package:flutter/foundation.dart';

/// Whether [platform] (default: the running one) ships through an Apple store.
///
/// Apple store builds (iOS, iPadOS and macOS, including the iOS app on a Mac)
/// carry no in-app purchase. App Store guidelines 3.1.1 and 3.1.3 therefore
/// forbid any purchase, upgrade or top-up call to action, pricing prompt, or
/// link or instruction that sends people to buy elsewhere. Plans bought on the
/// web still unlock features after sign-in; the app only reports access.
bool isAppleStorePlatform([TargetPlatform? platform]) {
  final target = platform ?? defaultTargetPlatform;
  return target == TargetPlatform.iOS || target == TargetPlatform.macOS;
}
