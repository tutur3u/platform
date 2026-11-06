import 'package:flutter/foundation.dart';

const _threadsDefine = bool.fromEnvironment('MASTERMIND_THREADS');
bool? _threadsOverride;

/// Whether Threads replaces the Work tab (`MASTERMIND_THREADS`, default off).
/// A getter, not a constant, so the flag-on path can run in the default test
/// suite through [debugOverrideMastermindThreads].
bool get mastermindThreadsEnabled => _threadsOverride ?? _threadsDefine;

/// Forces the flag on or off, or restores the build default with `null`.
/// Tests only.
@visibleForTesting
void debugOverrideMastermindThreads({required bool? enabled}) =>
    _threadsOverride = enabled;
