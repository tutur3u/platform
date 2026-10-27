part of 'snapshot.dart';

final class DeliveryCiPoint {
  const DeliveryCiPoint({
    required this.t,
    required this.repo,
    required this.queued,
    required this.running,
  });

  final DateTime t;
  final RepositoryName repo;
  final int? queued;
  final int? running;
}

final class OpenPrPoint {
  const OpenPrPoint({
    required this.t,
    required this.product,
    required this.count,
  });

  final DateTime t;
  final Product product;
  final int? count;
}

final class Security {
  Security({
    required this.coverage,
    required List<SecurityRegisterEntry> register,
    required List<SecurityPoint> series,
    required List<TimeToFixPoint> timeToFix,
  }) : register = List.unmodifiable(register),
       series = List.unmodifiable(series),
       timeToFix = List.unmodifiable(timeToFix);

  final Coverage coverage;
  final List<SecurityRegisterEntry> register;
  final List<SecurityPoint> series;
  final List<TimeToFixPoint> timeToFix;
}
