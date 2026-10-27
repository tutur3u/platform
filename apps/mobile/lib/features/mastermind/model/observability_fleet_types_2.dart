part of 'snapshot.dart';

final class LatencyPoint {
  const LatencyPoint({
    required this.t,
    required this.medianSeconds,
    required this.samples,
  });

  final DateTime t;
  final double? medianSeconds;
  final int samples;
}

final class QueuePoint {
  const QueuePoint({
    required this.t,
    required this.depth,
    required this.steer,
    required this.queue,
    required this.start,
  });

  final DateTime t;
  final int? depth;
  final int? steer;
  final int? queue;
  final int? start;
}

final class FailurePoint {
  const FailurePoint({
    required this.t,
    required this.cause,
    required this.count,
  });

  final DateTime t;
  final FailureCause cause;
  final int count;
}
