import 'package:flutter/foundation.dart';

const _irisDefine = bool.fromEnvironment('MASTERMIND_IRIS');
bool? _irisOverride;

/// Whether the hub Worker reports `iris: true` on `/v1/capabilities`. The
/// Worker flips it without a store release; a Worker without the key, or a
/// failed check, leaves it false.
final ValueNotifier<bool> mastermindIrisCapability = ValueNotifier(false);

/// Whether Iris (the Inbox Chat segment) is on: the `MASTERMIND_IRIS` define
/// (dev, staging and tests) or the hub capability (TestFlight and Play
/// internal). A getter, not a constant, so the flag-on path can run in the
/// default test suite through [debugOverrideMastermindIris].
///
/// The relay still refuses a device that is not enrolled; the chat then shows
/// its access banner instead of messages.
bool get mastermindIrisEnabled =>
    _irisOverride ?? (_irisDefine || mastermindIrisCapability.value);

/// Forces the flag on or off, or restores the build default with `null`.
/// Tests only.
@visibleForTesting
void debugOverrideMastermindIris({required bool? enabled}) =>
    _irisOverride = enabled;
