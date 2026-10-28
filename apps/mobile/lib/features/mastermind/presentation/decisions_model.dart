import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/presentation/gmt7.dart';

/// One GMT+7 calendar day of the journal, newest decision first.
final class DecisionDay {
  const DecisionDay({required this.at, required this.decisions});

  /// An instant inside the day, for formatting its header in GMT+7.
  final DateTime at;
  final List<JournalDecision> decisions;
}

/// What the Inbox Decisions segment renders, derived from one accepted
/// snapshot: the journal, newest first, grouped by GMT+7 day.
///
/// The journal is history, so nothing here is answerable. Security decisions
/// do not exist in schema 1.4 (the parser rejects them), so there is nothing to
/// redact here beyond rendering only the closed fields.
final class MastermindDecisionsModel {
  const MastermindDecisionsModel._({
    required this.days,
    required this.total,
    required this.skipped,
    required this.products,
    required this.hasReversibleChoice,
  });

  factory MastermindDecisionsModel.from(
    MastermindSnapshot snapshot, {
    Product? product,
    bool? reversible,
  }) {
    final all = [
      for (final decision in snapshot.decisions)
        if (decision is JournalDecision) decision,
    ]..sort(_newestFirst);
    final shown = [
      for (final decision in all)
        if ((product == null || decision.product == product) &&
            (reversible == null || decision.reversible == reversible))
          decision,
    ];
    final days = <DecisionDay>[];
    String? currentKey;
    for (final decision in shown) {
      final wall = Gmt7.wallTime(decision.at);
      final key = '${wall.year}-${wall.month}-${wall.day}';
      if (key != currentKey) {
        currentKey = key;
        days.add(DecisionDay(at: decision.at, decisions: []));
      }
      days.last.decisions.add(decision);
    }
    return MastermindDecisionsModel._(
      days: days,
      total: all.length,
      skipped: snapshot.decisionsSkipped,
      products: {
        for (final decision in all)
          if (decision.product != null) decision.product!,
      }.toList(growable: false),
      hasReversibleChoice:
          all.any((d) => d.reversible) && all.any((d) => !d.reversible),
    );
  }

  final List<DecisionDay> days;

  /// Journal entries before any filter.
  final int total;

  /// `decisions_skipped`: older entries the snapshot left out.
  final int skipped;

  /// Products present in the journal, for the filter chips.
  final List<Product> products;

  /// Both reversible and irreversible entries exist, so the chips can split.
  final bool hasReversibleChoice;

  int get shownCount => days.fold(0, (sum, day) => sum + day.decisions.length);
  bool get isEmpty => total == 0;
  bool get hasNoMatches => total > 0 && shownCount == 0;
}

// List.sort is not stable, so the id breaks ties explicitly.
int _newestFirst(JournalDecision a, JournalDecision b) {
  final byTime = b.at.compareTo(a.at);
  return byTime != 0 ? byTime : a.id.compareTo(b.id);
}

/// The journal decision with [id], if the snapshot still holds it.
JournalDecision? journalDecisionById(MastermindSnapshot snapshot, String id) {
  for (final decision in snapshot.decisions) {
    if (decision is JournalDecision && decision.id == id) return decision;
  }
  return null;
}

/// How a decision's `by` reads, with the role slug kept verbatim.
sealed class DecidedBy {
  const DecidedBy();

  factory DecidedBy.parse(String by) => switch (by) {
    'mastermind' => const DecidedByMastermind(),
    'user' => const DecidedByUser(),
    _ when by.startsWith('role:') => DecidedByRole(by.substring(5)),
    _ => DecidedByRole(by),
  };
}

final class DecidedByMastermind extends DecidedBy {
  const DecidedByMastermind();
}

final class DecidedByUser extends DecidedBy {
  const DecidedByUser();
}

final class DecidedByRole extends DecidedBy {
  const DecidedByRole(this.slug);

  final String slug;
}
