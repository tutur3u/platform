import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_thread_models.dart';

/// Why a thread call failed, as a state a screen shows; never a server
/// message.
///
/// [machineOffline] is its own state: the list is read from the owner's Mac on
/// demand, so the last cached list is all there is until it reconnects.
/// [mfaRequired] on a reply means the session needs a fresh second-factor
/// proof; verify, then resend with the same idempotency key.
enum FleetThreadFailure {
  machineOffline,
  timeout,
  unknownThread,
  rateLimited,
  mfaRequired,
  forbidden,

  /// A 403 abuse step-up this client cannot pass.
  challenged,

  /// Web refused the request as malformed or unsupported.
  rejected,

  /// The key was used for a different reply.
  conflict,
  unavailable,
  unreadable,
}

class FleetThreadException implements Exception {
  const FleetThreadException(this.failure, {this.code});

  factory FleetThreadException.from(Object error) => switch (error) {
    FleetThreadException() => error,
    FormatException() => const FleetThreadException(
      FleetThreadFailure.unreadable,
    ),
    ApiException(isVerificationRequired: true) => const FleetThreadException(
      FleetThreadFailure.challenged,
    ),
    ApiException(:final statusCode, :final message) => FleetThreadException(
      _failure(statusCode, message),
      code: _code(message),
    ),
    _ => const FleetThreadException(FleetThreadFailure.unavailable),
  };

  final FleetThreadFailure failure;

  /// Web's closed-set error code (`machine_offline`, `outbox_full`, ...);
  /// anything else is dropped so no server text reaches the screen.
  final String? code;

  /// Asking again can succeed. A reply whose answer was
  /// [FleetThreadFailure.unreadable] is worth sending again too, under its
  /// key; the reply cubit adds that case.
  bool get retryable =>
      failure == FleetThreadFailure.machineOffline ||
      failure == FleetThreadFailure.timeout ||
      failure == FleetThreadFailure.rateLimited ||
      failure == FleetThreadFailure.unavailable;

  static String? _code(String message) =>
      RegExp(r'^[a-z][a-z_]{0,40}$').hasMatch(message) ? message : null;

  static FleetThreadFailure _failure(int status, String message) =>
      switch (message) {
        'machine_offline' => FleetThreadFailure.machineOffline,
        'timeout' => FleetThreadFailure.timeout,
        'unknown_thread' => FleetThreadFailure.unknownThread,
        'rate_limited' || 'budget_exhausted' => FleetThreadFailure.rateLimited,
        'mfa_required' => FleetThreadFailure.mfaRequired,
        'idempotency_conflict' => FleetThreadFailure.conflict,
        _ => switch (status) {
          401 || 403 => FleetThreadFailure.forbidden,
          404 => FleetThreadFailure.unknownThread,
          409 => FleetThreadFailure.conflict,
          429 => FleetThreadFailure.rateLimited,
          504 => FleetThreadFailure.timeout,
          >= 400 && < 500 when status != 408 => FleetThreadFailure.rejected,
          _ => FleetThreadFailure.unavailable,
        },
      };
}

/// Reads the owner's fleet threads and sends replies into them.
abstract interface class FleetThreadSource {
  /// The bridge machine and the machines linked to it.
  Future<FleetThreadMachines> machines(String machineId);

  /// Projects of the bridge machine with a thread count per state.
  Future<FleetThreadProjects> projects(String machineId);

  /// One page of threads, newest first. [projectId] is one project or
  /// [fleetNoProject]; [ownerReply] adds when the owner last wrote in each
  /// thread of the bridge machine.
  Future<FleetThreadPage> threads({
    required String machineId,
    String? environmentId,
    String? query,
    String? projectId,
    FleetThreadState? state,
    bool ownerReply = false,
    int? cursor,
    int? limit,
  });

  /// One page of history, oldest first; [before] is the `earlierPosition` of
  /// the page after it.
  Future<FleetThreadMessages> messages({
    required String machineId,
    required String threadId,
    String? environmentId,
    int? before,
    int? limit,
  });

  /// Records that the owner has seen [itemCount] items of a thread. False
  /// when Web did not save it (it lost a race with another marker): the list
  /// keeps its unread count until a later call saves.
  Future<bool> markRead({
    required String machineId,
    required String threadId,
    required int itemCount,
    String? environmentId,
  });

  /// Sends a reply. [idempotencyKey] is a UUID made once per reply and
  /// reused on every retry, so a retry returns the first receipt.
  Future<FleetThreadReply> reply({
    required String machineId,
    required String threadId,
    required String text,
    required String idempotencyKey,
    String? environmentId,
  });

  /// The current receipt of a reply.
  Future<FleetThreadReply> receipt(String replyId);
}

class FleetThreadRepository implements FleetThreadSource {
  FleetThreadRepository({ApiClient? api}) : _api = api ?? ApiClient();

  static const _base = '/api/v1/mastermind/fleet';

  /// The path with its query; null and empty values are left out.
  static String path(String route, [Map<String, Object?> query = const {}]) {
    final pairs = {
      for (final MapEntry(:key, :value) in query.entries)
        if (value != null && '$value'.isNotEmpty) key: '$value',
    };
    return Uri(
      path: '$_base/$route',
      queryParameters: pairs.isEmpty ? null : pairs,
    ).toString();
  }

  final ApiClient _api;

  Future<T> _read<T>(String path, T Function(Object? json) parse) async {
    try {
      return parse(await _api.getJson(path));
    } on Object catch (error) {
      throw FleetThreadException.from(error);
    }
  }

  @override
  Future<FleetThreadMachines> machines(String machineId) => _read(
    path('threads/machines', {'machineId': machineId}),
    FleetThreadMachines.parse,
  );

  @override
  Future<FleetThreadProjects> projects(String machineId) => _read(
    path('threads/projects', {'machineId': machineId}),
    FleetThreadProjects.parse,
  );

  @override
  Future<FleetThreadPage> threads({
    required String machineId,
    String? environmentId,
    String? query,
    String? projectId,
    FleetThreadState? state,
    bool ownerReply = false,
    int? cursor,
    int? limit,
  }) => _read(
    path('threads', {
      'machineId': machineId,
      'environmentId': environmentId,
      'q': query?.trim(),
      'projectId': projectId,
      'state': state?.name,
      'include': ownerReply ? 'ownerReply' : null,
      'cursor': cursor,
      'limit': limit,
    }),
    FleetThreadPage.parse,
  );

  @override
  Future<FleetThreadMessages> messages({
    required String machineId,
    required String threadId,
    String? environmentId,
    int? before,
    int? limit,
  }) => _read(
    path('threads/messages', {
      'machineId': machineId,
      'environmentId': environmentId,
      'threadId': threadId,
      'before': before,
      'limit': limit,
    }),
    FleetThreadMessages.parse,
  );

  @override
  Future<bool> markRead({
    required String machineId,
    required String threadId,
    required int itemCount,
    String? environmentId,
  }) async {
    try {
      final json = await _api.postJson(path('threads/read'), {
        'machineId': machineId,
        'environmentId': ?environmentId,
        'threadId': threadId,
        'itemCount': itemCount,
      });
      final saved = json['saved'];
      if (saved is! bool) throw const FormatException('Invalid fleet marker');
      return saved;
    } on Object catch (error) {
      throw FleetThreadException.from(error);
    }
  }

  @override
  Future<FleetThreadReply> reply({
    required String machineId,
    required String threadId,
    required String text,
    required String idempotencyKey,
    String? environmentId,
  }) async {
    try {
      // The key travels in the body: ApiClient owns the request headers.
      return FleetThreadReply.parse(
        await _api.postJson(path('replies'), {
          'machineId': machineId,
          'environmentId': ?environmentId,
          'threadId': threadId,
          'text': text,
          'idempotencyKey': idempotencyKey,
        }),
      );
    } on Object catch (error) {
      throw FleetThreadException.from(error);
    }
  }

  @override
  Future<FleetThreadReply> receipt(String replyId) => _read(
    path('replies/${Uri.encodeComponent(replyId)}'),
    FleetThreadReply.parse,
  );
}
