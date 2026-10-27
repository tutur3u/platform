part of 'snapshot.dart';

final class BacklogItem implements BacklogEntry {
  const BacklogItem({
    required this.id,
    required this.title,
    required this.state,
    this.product,
  });

  final String id;
  @override
  final String title;
  final ItemState state;
  final Product? product;
}

final class JournalDecision extends Decision {
  const JournalDecision({
    required this.id,
    required this.at,
    required this.title,
    required this.area,
    required this.risk,
    required this.by,
    required this.category,
    required this.reversible,
    this.why,
    this.product,
  });

  @override
  final String id;
  @override
  final DateTime at;
  @override
  final String title;
  final DecisionArea area;
  @override
  final Risk risk;
  final String by;
  final DecisionCategory category;
  final String? why;
  final bool reversible;
  @override
  final Product? product;
}

final class SecurityDecision extends Decision {
  const SecurityDecision({
    required this.id,
    required this.at,
    required this.title,
    required this.area,
    required this.risk,
    this.product,
  });

  @override
  final String id;
  @override
  final DateTime at;
  @override
  final String title;
  final String area;
  @override
  final Risk risk;
  @override
  final Product? product;
}
