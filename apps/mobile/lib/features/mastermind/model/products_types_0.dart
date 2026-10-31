part of 'snapshot.dart';

final class SnapshotEvent {
  const SnapshotEvent({
    required this.seq,
    required this.ts,
    required this.kind,
    required this.payload,
  });

  final int seq;
  final DateTime ts;
  final EventKind kind;
  final EventPayload payload;
}

final class ProductRelease implements EventPayload {
  const ProductRelease({
    required this.product,
    required this.prodAgeSeconds,
    required this.ageBasis,
  });

  final ReleaseProduct product;
  final int? prodAgeSeconds;
  final AgeBasis ageBasis;
}

final class ProductQuota implements EventPayload {
  const ProductQuota({
    required this.instance,
    required this.remainingPercent,
    required this.ageSeconds,
  });

  final String instance;
  final double? remainingPercent;
  final int? ageSeconds;
}
