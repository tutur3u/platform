import 'package:mobile/features/mastermind/fleet/data/fleet_thread_models.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_thread_repository.dart';
import 'package:mobile/features/mastermind/projects/data/projects_models.dart';
import 'package:mobile/features/mastermind/projects/data/projects_repository.dart';

/// Replies for fixture builds and tests: a reply is held (`sent`) when
/// posted and delivered when its receipt is read, the way the machine's
/// receipt follows over the owner socket. Only [reply] and [receipt] answer.
class FixtureReplySource implements FleetThreadSource {
  FixtureReplySource({
    required this.stateOf,
    required this.takeFailure,
    required this.now,
  });

  /// The fixture state of a thread; null when unknown.
  final ProjectThreadState? Function(String threadId) stateOf;

  /// The fixture's next failure, consumed.
  final ProjectsFailureKind? Function() takeFailure;
  final DateTime now;
  final _replies = <String, FleetThreadReply>{};

  @override
  Future<FleetThreadReply> reply({
    required String machineId,
    required String threadId,
    required String text,
    required String idempotencyKey,
    String? environmentId,
  }) async {
    if (takeFailure() case final kind?) {
      throw FleetThreadException(switch (kind) {
        ProjectsFailureKind.mfaRequired => FleetThreadFailure.mfaRequired,
        ProjectsFailureKind.machineOffline => FleetThreadFailure.machineOffline,
        ProjectsFailureKind.timeout => FleetThreadFailure.timeout,
        ProjectsFailureKind.forbidden => FleetThreadFailure.forbidden,
        _ => FleetThreadFailure.unavailable,
      });
    }
    // Web uses the Idempotency-Key as the reply id; a retry gets its receipt.
    return _replies[idempotencyKey] ??= FleetThreadReply(
      id: idempotencyKey,
      machineId: machineId,
      threadId: threadId,
      environmentId: environmentId,
      state: FleetReplyState.sent,
      createdAt: now,
    );
  }

  @override
  Future<FleetThreadReply> receipt(String replyId) async {
    final sent = _replies[replyId];
    if (sent == null) {
      throw const FleetThreadException(FleetThreadFailure.unknownThread);
    }
    final state = stateOf(sent.threadId);
    return _replies[replyId] = FleetThreadReply(
      id: sent.id,
      machineId: sent.machineId,
      threadId: sent.threadId,
      environmentId: sent.environmentId,
      state: state == ProjectThreadState.failed
          ? FleetReplyState.failed
          : FleetReplyState.delivered,
      delivery: switch (state) {
        ProjectThreadState.waiting => FleetReplyDelivery.queued,
        ProjectThreadState.idle => FleetReplyDelivery.started,
        _ => FleetReplyDelivery.steered,
      },
      createdAt: sent.createdAt,
      settledAt: now,
    );
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => throw UnsupportedError(
    'The fixture reads threads through FixtureProjectsRepository',
  );
}
