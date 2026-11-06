part of 'snapshot.dart';

final class Ci {
  const Ci({
    required this.repo,
    required this.queued,
    required this.running,
    required this.t,
  });

  final RepositoryName repo;
  final int? queued;
  final int? running;
  final DateTime t;
}

final class Cadence {
  const Cadence({required this.product, required this.lastProdAt});

  final ReleaseProduct product;
  final DateTime? lastProdAt;
}

final class Receipt implements EventPayload {
  const Receipt({
    required this.product,
    required this.state,
    required this.title,
  });

  final ReceiptProduct product;
  final ReceiptState state;
  final String title;
}
