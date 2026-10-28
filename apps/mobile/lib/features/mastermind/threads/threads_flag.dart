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

const _historyDefine = bool.fromEnvironment('MASTERMIND_THREAD_HISTORY');
bool? _historyOverride;

/// Whether a thread's read-only history opens (`MASTERMIND_THREAD_HISTORY`,
/// default off, P1b). It needs Threads on as well, and it is keyed on the
/// hub's v2 `thread_ref`, never on a v1 lane id.
bool get mastermindThreadHistoryEnabled =>
    mastermindThreadsEnabled && (_historyOverride ?? _historyDefine);

/// Forces the history flag on or off, or restores the build default with
/// `null`. Tests only.
@visibleForTesting
void debugOverrideMastermindThreadHistory({required bool? enabled}) =>
    _historyOverride = enabled;
