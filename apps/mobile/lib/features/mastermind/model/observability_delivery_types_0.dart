part of 'snapshot.dart';

final class Delivery {
  Delivery({
    required this.coverage,
    required List<ShipPoint> ships,
    required List<MergeToLivePoint> mergeToLive,
    required List<DeliveryCiPoint> ci,
    required List<OpenPrPoint> openPrs,
  }) : ships = List.unmodifiable(ships),
       mergeToLive = List.unmodifiable(mergeToLive),
       ci = List.unmodifiable(ci),
       openPrs = List.unmodifiable(openPrs);

  final Coverage coverage;
  final List<ShipPoint> ships;
  final List<MergeToLivePoint> mergeToLive;
  final List<DeliveryCiPoint> ci;
  final List<OpenPrPoint> openPrs;
}

final class ShipPoint {
  const ShipPoint({
    required this.t,
    required this.product,
    required this.count,
  });

  final DateTime t;
  final Product product;
  final int count;
}

final class MergeToLivePoint {
  const MergeToLivePoint({
    required this.t,
    required this.product,
    required this.medianMinutes,
    required this.samples,
  });

  final DateTime t;
  final Product product;
  final double? medianMinutes;
  final int samples;
}
