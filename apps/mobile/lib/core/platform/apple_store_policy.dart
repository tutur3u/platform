import 'package:flutter/foundation.dart';

/// Whether [platform] (default: the running one) ships through an Apple store.
///
/// Apple store builds (iOS, iPadOS and macOS, including the iOS app on a Mac)
/// ship without in-app purchases for v1. The app reports existing account
/// access without purchase, upgrade, top-up or external billing prompts.
bool isAppleStorePlatform([TargetPlatform? platform]) {
  final target = platform ?? defaultTargetPlatform;
  return target == TargetPlatform.iOS || target == TargetPlatform.macOS;
}
