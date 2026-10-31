import 'package:mobile/features/mastermind/iris/data/iris_models.dart';

/// The Iris relay as the app sees it: the chat feed, the composer's sends and
/// their receipts, "What needs me", and device trust.
///
/// Ask answers are not here: they keep the hub's `/v1/replies` path so Atlas
/// reads one answer source.
abstract interface class IrisRelay {
  bool get isConfigured;

  /// One feed page, oldest first so the newest is last. With neither cursor
  /// it is the latest page; [before] pages back through history and [after]
  /// is the forward poll (its page carries `next_after`). Never both. An
  /// unknown cursor is `notFound`: reset it and reload the latest page.
  Future<IrisResult<IrisFeedPage>> feed({
    String? before,
    String? after,
    int limit = 50,
  });

  /// Sends [text] to Atlas. [idempotencyKey] makes a retry the same message,
  /// so a retry must reuse it.
  Future<IrisResult<IrisReceipt>> send(
    String text, {
    required String idempotencyKey,
  });

  Future<IrisResult<IrisReceipt>> receipt(String id);

  Future<IrisResult<IrisSummary>> summary();

  /// Starts enrolment. The owner then confirms the returned code on the Iris
  /// enrol page with their passkey; poll [device] until it is confirmed or
  /// expired.
  Future<IrisResult<IrisEnrollment>> enroll(
    String publicKey,
    String fingerprint,
  );

  Future<IrisResult<IrisDevice>> device(String id);

  Future<IrisResult<List<IrisDevice>>> devices();

  Future<IrisResult<void>> revoke(String id);
}

/// Signs one relay request. The native device key (Secure Enclave or
/// Keystore) implements this in a later lane; until then a fake stands in.
///
/// Returns the `X-Iris-Device`, `X-Iris-Ts`, `X-Iris-Nonce` and `X-Iris-Sig`
/// headers. The path includes the query string; the signature covers the
/// method, path, sha256 of the body, timestamp, nonce, device id and, on
/// writes, the Idempotency-Key.
abstract interface class IrisRequestSigner {
  Future<Map<String, String>> sign(
    String method,
    String path,
    List<int> body, {
    String? idempotencyKey,
  });
}

/// Header names every signed request carries.
abstract final class IrisHeaders {
  static const device = 'X-Iris-Device';
  static const ts = 'X-Iris-Ts';
  static const nonce = 'X-Iris-Nonce';
  static const sig = 'X-Iris-Sig';
  static const List<String> all = [device, ts, nonce, sig];
}

/// A build with no relay: every call is `notConfigured`.
final class UnconfiguredIrisRelay implements IrisRelay {
  const UnconfiguredIrisRelay();

  static const _none = IrisFailure(IrisFailureKind.notConfigured);

  @override
  bool get isConfigured => false;

  @override
  Future<IrisResult<IrisFeedPage>> feed({
    String? before,
    String? after,
    int limit = 50,
  }) => Future.value(const IrisErr(_none));

  @override
  Future<IrisResult<IrisReceipt>> send(
    String text, {
    required String idempotencyKey,
  }) => Future.value(const IrisErr(_none));

  @override
  Future<IrisResult<IrisReceipt>> receipt(String id) =>
      Future.value(const IrisErr(_none));

  @override
  Future<IrisResult<IrisSummary>> summary() =>
      Future.value(const IrisErr(_none));

  @override
  Future<IrisResult<IrisEnrollment>> enroll(
    String publicKey,
    String fingerprint,
  ) => Future.value(const IrisErr(_none));

  @override
  Future<IrisResult<IrisDevice>> device(String id) =>
      Future.value(const IrisErr(_none));

  @override
  Future<IrisResult<List<IrisDevice>>> devices() =>
      Future.value(const IrisErr(_none));

  @override
  Future<IrisResult<void>> revoke(String id) =>
      Future.value(const IrisErr(_none));
}

/// Poll spacing: [base] while healthy, doubling per consecutive failure up to
/// [max], and never sooner than a 429's `Retry-After`.
final class IrisBackoff {
  IrisBackoff({
    this.base = const Duration(seconds: 15),
    this.max = const Duration(minutes: 5),
  });

  final Duration base;
  final Duration max;
  int _failures = 0;

  int get failures => _failures;

  void succeeded() => _failures = 0;

  Duration next([IrisFailure? failure]) {
    if (failure == null) {
      _failures = 0;
      return base;
    }
    _failures++;
    final shift = _failures.clamp(0, 10);
    var wait = base * (1 << shift);
    if (wait > max) wait = max;
    final retryAfter = failure.retryAfter;
    if (retryAfter != null && retryAfter > wait) wait = retryAfter;
    return wait;
  }
}
