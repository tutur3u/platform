import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/mastermind/fleet_access/data/fleet_access_models.dart';
import 'package:mobile/features/mastermind/fleet_access/data/fleet_intent_draft.dart';

/// Why a Fleet call failed, as a closed category; never a server message.
enum FleetAccessFailure {
  /// 401: the session was not accepted.
  session,

  /// 403: access, the grant or the capability is no longer live.
  forbidden,

  /// 403 `invalid_confirmation`: the link id or code is wrong or expired.
  invalidConfirmation,

  /// 409 `identity_already_linked`.
  alreadyLinked,

  /// 409 `stale_project_mapping`: the catalog changed under the request.
  staleMapping,

  /// 429: the grant's hourly question or daily request cap is used up.
  quota,

  /// 400: the server refused the request's shape or its target.
  invalid,

  /// The device is offline or the server could not answer.
  unavailable,

  /// The server answered something this build cannot read.
  unreadable,
}

class FleetAccessException implements Exception {
  const FleetAccessException(this.failure);

  factory FleetAccessException.from(Object error) => switch (error) {
    FleetAccessException() => error,
    FormatException() => const FleetAccessException(
      FleetAccessFailure.unreadable,
    ),
    ApiException(statusCode: 401) => const FleetAccessException(
      FleetAccessFailure.session,
    ),
    ApiException(statusCode: 403, message: 'invalid_confirmation') =>
      const FleetAccessException(FleetAccessFailure.invalidConfirmation),
    ApiException(statusCode: 403) => const FleetAccessException(
      FleetAccessFailure.forbidden,
    ),
    ApiException(statusCode: 409, message: 'identity_already_linked') =>
      const FleetAccessException(FleetAccessFailure.alreadyLinked),
    ApiException(statusCode: 409) => const FleetAccessException(
      FleetAccessFailure.staleMapping,
    ),
    ApiException(statusCode: 429) => const FleetAccessException(
      FleetAccessFailure.quota,
    ),
    ApiException(statusCode: 400 || 413 || 415) => const FleetAccessException(
      FleetAccessFailure.invalid,
    ),
    _ => const FleetAccessException(FleetAccessFailure.unavailable),
  };

  final FleetAccessFailure failure;

  @override
  String toString() => 'FleetAccessException(${failure.name})';
}

/// The `/api/v1/fleet/**` calls the mobile Fleet view makes. Every call goes
/// through the app's [ApiClient] with the signed-in session; nothing is
/// cached, so a revoked grant is never read from disk.
abstract interface class FleetAccessSource {
  Future<FleetAccess> access();

  Future<FleetDigest> digest();

  Future<FleetIntentPage> intents({String? before});

  /// Returns the new intent id.
  Future<String> submit(FleetIntentDraft draft);

  Future<FleetLinkCode> createLinkCode();

  Future<FleetLinkPreview> confirmLink({
    required String linkId,
    required String confirmationCode,
    required bool preview,
  });
}

class FleetAccessRepository implements FleetAccessSource {
  FleetAccessRepository({ApiClient? api, DateTime Function()? clock})
    : _client = api,
      _clock = clock ?? DateTime.now;

  static const accessPath = '/api/v1/fleet/access';
  static const digestPath = '/api/v1/fleet/digest';
  static const intentsPath = '/api/v1/fleet/intents';
  static const linkCodesPath = '/api/v1/fleet/identity/link-codes';
  static const confirmPath = '/api/v1/fleet/identity/confirm';

  // Created on first call, so a session that never opens Fleet opens no
  // client.
  ApiClient? _client;
  ApiClient get _api => _client ??= ApiClient();
  final DateTime Function() _clock;

  Future<T> _guard<T>(Future<T> Function() call) async {
    try {
      return await call();
    } on Object catch (error) {
      throw FleetAccessException.from(error);
    }
  }

  @override
  Future<FleetAccess> access() =>
      _guard(() async => FleetAccess.parse(await _api.getJson(accessPath)));

  @override
  Future<FleetDigest> digest() =>
      _guard(() async => FleetDigest.parse(await _api.getJson(digestPath)));

  @override
  Future<FleetIntentPage> intents({String? before}) => _guard(() async {
    final path = before == null
        ? intentsPath
        : '$intentsPath?before=${Uri.encodeQueryComponent(before)}';
    return FleetIntentPage.parse(await _api.getJson(path));
  });

  @override
  Future<String> submit(FleetIntentDraft draft) => _guard(() async {
    final json = await _api.postJson(intentsPath, draft.toJson());
    final id = json['id'];
    if (id is! String || !isFleetUuid(id)) {
      throw const FormatException('Invalid Fleet intent receipt');
    }
    return id;
  });

  @override
  Future<FleetLinkCode> createLinkCode() => _guard(() async {
    final requested = _clock();
    return FleetLinkCode.parse(
      await _api.postJson(linkCodesPath, const <String, Object?>{}),
      requested,
    );
  });

  @override
  Future<FleetLinkPreview> confirmLink({
    required String linkId,
    required String confirmationCode,
    required bool preview,
  }) => _guard(() async {
    final link = FleetLinkPreview.parse(
      await _api.postJson(confirmPath, {
        'linkId': linkId,
        'confirmationCode': confirmationCode,
        if (preview) 'preview': true,
      }),
    );
    // A preview that reports a finished link, or a confirmation that does
    // not, is not an answer this flow can trust.
    if (link.linked == preview) {
      throw const FormatException('Unexpected Fleet link state');
    }
    return link;
  });
}
