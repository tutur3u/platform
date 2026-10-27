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
