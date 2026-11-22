import 'dart:async';

import 'package:cloudflare_turnstile/cloudflare_turnstile.dart';
import 'package:flutter/foundation.dart';
import 'package:mobile/core/config/env.dart';
import 'package:mobile/data/sources/supabase_client.dart';

/// Background Turnstile solves, shared by every caller.
///
/// [prewarm] starts an invisible solve when a protected flow opens (sign-in,
/// feedback), so its submit usually finds a token ready. Turnstile tokens
/// expire 300 seconds after issue, so a ready token is handed out only within
/// [lifetime], once ([take]), to whichever action asks first, and only to the
/// account (or signed-out state) that started its solve.
abstract final class SecurityCheckPrewarm {
  /// How long a background solve may take before the interactive check.
  static const timeout = Duration(seconds: 8);

  /// How long a prewarmed token stays usable. Turnstile allows 300 s; the
  /// rest is margin for pacing and proof preparation before dispatch.
  static const lifetime = Duration(minutes: 3);

  /// Upper bound for one invisible solve, so a stuck WebView cannot hold the
  /// single flight forever. The solver retires its WebView at this limit.
  static const solveLimit = Duration(seconds: 30);

  static Future<String?>? _inFlight;
  static ({String token, Duration issued, String? scope})? _ready;
  static final Stopwatch _monotonic = Stopwatch()..start();

  /// Background solver; tests replace it.
  @visibleForTesting
  static Future<String?> Function() solver = _invisibleSolve;

  /// Monotonic time, so a wall-clock change cannot extend a token's life.
  @visibleForTesting
  static Duration Function() elapsed = _monotonicElapsed;

  /// The account a solve belongs to (null while signed out). A token never
  /// crosses a sign-in, sign-out or account switch.
  @visibleForTesting
  static String? Function() scope = _authScope;

  @visibleForTesting
  static void reset() {
    _inFlight = null;
    _ready = null;
    solver = _invisibleSolve;
    elapsed = _monotonicElapsed;
    scope = _authScope;
  }

  static Duration _monotonicElapsed() => _monotonic.elapsed;

  static String? _authScope() => maybeSupabase?.auth.currentUser?.id;

  /// Starts a background solve unless one is running or a token is ready.
  static void prewarm() {
    if (!Env.isTurnstileConfigured) return;
    unawaited(warm());
  }

  /// [prewarm] without the configuration check; completes when the solve
  /// it started (if any) settles.
  @visibleForTesting
  static Future<void> warm() async {
    if (_inFlight != null || _usable(_ready)) return;
    await _solve();
  }

  static bool _usable(
    ({String token, Duration issued, String? scope})? ready,
  ) =>
      ready != null &&
      ready.scope == scope() &&
      elapsed() - ready.issued < lifetime;

  /// The ready token for the current account, at most once; an expired or
  /// other-account token is dropped.
  static String? take() {
    final ready = _ready;
    _ready = null;
    return _usable(ready) ? ready!.token : null;
  }

  /// A token for a step-up now: the ready one, the solve in flight, or a
  /// new solve, within [timeout]. When another caller (or another account)
  /// takes or owns the token a shared solve produced, one more solve runs
  /// in the time left.
  static Future<String?> background() async {
    final watch = Stopwatch()..start();
    for (var attempt = 0; attempt < 2; attempt++) {
      final ready = take();
      if (ready != null) return ready;
      final remaining = timeout - watch.elapsed;
      if (remaining <= Duration.zero) return null;
      await _solve().timeout(remaining, onTimeout: () => null);
    }
    return take();
  }

  static Future<String?> _solve() {
    final running = _inFlight;
    if (running != null) return running;
    final owner = scope();
    final solve = () async {
      try {
        // A backstop above the solver's own limit.
        final token = await solver().timeout(
          solveLimit + const Duration(seconds: 5),
        );
        if (token != null && token.isNotEmpty) {
          _ready = (token: token, issued: elapsed(), scope: owner);
          return token;
        }
      } on Object {
        // Unavailable here, or Cloudflare needs interaction.
      }
      return null;
    }();
    _inFlight = solve;
    unawaited(
      solve.whenComplete(() {
        if (identical(_inFlight, solve)) _inFlight = null;
      }),
    );
    return solve;
  }

  static Future<String?> _invisibleSolve() async {
    final invisible = CloudflareTurnstile.invisible(
      siteKey: Env.turnstileSiteKey,
      baseUrl: Env.turnstileBaseUrl,
    );
    // A failed WebView may hang during disposal; never wait for it.
    void retire() {
      try {
        unawaited(invisible.dispose().catchError((Object _) {}));
      } on Object {
        // Already retired.
      }
    }

    var settled = false;
    final pending = invisible.getToken().whenComplete(() => settled = true);
    try {
      return await pending.timeout(solveLimit);
    } finally {
      // Retire the WebView on success, failure and timeout alike.
      retire();
      if (!settled) {
        // The plugin ignores dispose while its WebView is still starting.
        // Retire it again when that start settles, and once more later in
        // case it never reports back.
        unawaited(
          pending
              .then<void>((_) {}, onError: (Object _) {})
              .whenComplete(retire),
        );
        unawaited(Future<void>.delayed(const Duration(minutes: 1), retire));
      }
    }
  }
}

/// Verified submits for one form (sign-in), now that the security check no
/// longer blocks the page.
///
/// One check runs at a time. A submit made while it runs (a double tap, or
/// switching from password to a one-time code) does not start another check
/// and is not lost: the token goes to the latest submit, if it is still
/// current. [cancel] (a step change, or leaving for another page) drops the
/// pending submit, and a submit already sending ignores new ones. While
/// Turnstile is configured, nothing is submitted without a token.
class SecurityCheckAttempts {
  /// Also prewarms a background token for the form's first submit.
  SecurityCheckAttempts.prewarmed({bool? requireToken})
    : _requireToken = requireToken ?? Env.isTurnstileConfigured {
    SecurityCheckPrewarm.prewarm();
  }

  final bool _requireToken;
  bool _verifying = false;
  bool _submitting = false;
  bool _suspended = false;
  ({bool Function() stillCurrent, Future<void> Function(String?) submit})?
  _intent;

  Future<void> run({
    required Future<String?> Function() verify,
    required bool Function() stillCurrent,
    required Future<void> Function(String? token) submit,
  }) async {
    if (_submitting || _suspended) return;
    _intent = (stillCurrent: stillCurrent, submit: submit);
    // The running check delivers its token to this newer submit.
    if (_verifying) return;
    _verifying = true;
    String? token;
    try {
      token = await verify();
    } finally {
      _verifying = false;
    }
    final intent = _intent;
    _intent = null;
    if (intent == null || !intent.stillCurrent()) return;
    // A cancelled or failed check never submits.
    if (_requireToken && (token == null || token.isEmpty)) return;
    _submitting = true;
    try {
      await intent.submit(token);
    } finally {
      _submitting = false;
    }
  }

  /// Drops the pending submit; a token that arrives later is not used.
  void cancel() => _intent = null;

  /// [cancel], and no new submit starts until [resume]: for a flow that is
  /// being torn down, such as cancelling add-account.
  void suspend() {
    _suspended = true;
    _intent = null;
  }

  void resume() => _suspended = false;
}
