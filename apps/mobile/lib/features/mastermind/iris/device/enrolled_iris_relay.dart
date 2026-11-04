import 'package:mobile/features/mastermind/iris/data/iris_models.dart';
import 'package:mobile/features/mastermind/iris/data/iris_relay.dart';

/// Fails every device call closed as `notEnrolled` until `canSign` says the
/// device holds an enrolment the relay could accept, so an unenrolled phone
/// sends nothing and never prompts for biometrics.
///
/// Enrolment and revoke pass through: they are owner-only relay routes that
/// carry no device signature. A device call the relay answers with
/// `deviceRevoked` runs `onRevoked`, so the device can drop its enrolment.
final class EnrolledIrisRelay implements IrisRelay {
  EnrolledIrisRelay({
    required IrisRelay inner,
    required Future<bool> Function() canSign,
    Future<void> Function()? onRevoked,
  }) : _inner = inner,
       _canSign = canSign,
       _onRevoked = onRevoked;

  final IrisRelay _inner;
  final Future<bool> Function() _canSign;
  final Future<void> Function()? _onRevoked;

  static const _notEnrolled = IrisFailure(IrisFailureKind.notEnrolled);

  Future<IrisResult<T>> _gated<T>(Future<IrisResult<T>> Function() call) async {
    if (!await _canSign()) return IrisErr<T>(_notEnrolled);
    final result = await call();
    if (result.failureOrNull?.kind == IrisFailureKind.deviceRevoked) {
      await _onRevoked?.call();
    }
    return result;
  }

  @override
  bool get isConfigured => _inner.isConfigured;

  @override
  Future<IrisResult<IrisFeedPage>> feed({
    String? before,
    String? after,
    int limit = 50,
  }) => _gated(() => _inner.feed(before: before, after: after, limit: limit));

  @override
  Future<IrisResult<IrisReceipt>> send(
    String text, {
    required String idempotencyKey,
  }) => _gated(() => _inner.send(text, idempotencyKey: idempotencyKey));

  @override
  Future<IrisResult<IrisReceipt>> receipt(String id) =>
      _gated(() => _inner.receipt(id));

  @override
  Future<IrisResult<IrisSummary>> summary() => _gated(_inner.summary);

  @override
  Future<IrisResult<IrisEnrollment>> enroll(
    String publicKey,
    String fingerprint, {
    required String deviceId,
    required String code,
  }) => _inner.enroll(publicKey, fingerprint, deviceId: deviceId, code: code);

  @override
  Future<IrisResult<IrisDevice>> device(String id) =>
      _gated(() => _inner.device(id));

  @override
  Future<IrisResult<List<IrisDevice>>> devices() => _gated(_inner.devices);

  @override
  Future<IrisResult<void>> revoke(String id) => _inner.revoke(id);
}
