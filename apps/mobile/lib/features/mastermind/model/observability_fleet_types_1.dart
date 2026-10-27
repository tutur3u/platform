part of 'snapshot.dart';

final class FleetTree {
  const FleetTree({
    required this.label,
    required this.product,
    required this.threads,
    required this.children,
    required this.grandchildren,
  });

  final Role label;
  final Product product;
  final int threads;
  final int children;
  final int grandchildren;
}

final class Coordination {
  Coordination({
    required this.coverage,
    required List<MessagePoint> messages,
    required List<LatencyPoint> latency,
    required List<QueuePoint> queue,
    required List<FailurePoint> failures,
  }) : messages = List.unmodifiable(messages),
       latency = List.unmodifiable(latency),
       queue = List.unmodifiable(queue),
       failures = List.unmodifiable(failures);

  final Coverage coverage;
  final List<MessagePoint> messages;
  final List<LatencyPoint> latency;
  final List<QueuePoint> queue;
  final List<FailurePoint> failures;
}

final class MessagePoint {
  const MessagePoint({
    required this.t,
    required this.senderRole,
    required this.receiverRole,
    required this.count,
  });

  final DateTime t;
  final Role senderRole;
  final Role receiverRole;
  final int count;
}
