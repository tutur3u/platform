import 'package:mobile/core/cache/offline_resource_reference.dart';
import 'package:mobile/core/cache/pending_mutation_record.dart';

class OfflineDependencyNode {
  const OfflineDependencyNode({
    required this.record,
    this.produces,
    this.deletes,
    this.serialIdentity,
    this.references = const {},
    this.requiredReferences = const {},
  });

  final PendingMutationRecord record;
  final OfflineResourceReference? produces;
  final OfflineResourceReference? deletes;
  final OfflineResourceReference? serialIdentity;
  final Set<OfflineResourceReference> references;

  /// Persisted known-local references remain required if their create vanishes.
  final Set<OfflineResourceReference> requiredReferences;
}

/// Orders actual prerequisite edges, while preserving edits to the same entity.
/// It does not dispatch, mutate records, or infer dependencies from prose.
class OfflineDependencyGraph {
  OfflineDependencyGraph(Iterable<OfflineDependencyNode> source) {
    final ordered = source.toList();
    final positions = {
      for (var i = 0; i < ordered.length; i++) ordered[i].record.id: i,
    };
    nodes = ordered
      ..sort((a, b) {
        final time = a.record.createdAt.compareTo(b.record.createdAt);
        return time != 0
            ? time
            : positions[a.record.id]!.compareTo(positions[b.record.id]!);
      });
    final producers = <OfflineResourceReference, List<String>>{};
    for (final node in nodes) {
      final produced = node.produces;
      if (produced != null) {
        producers.putIfAbsent(produced, () => []).add(node.record.id);
      }
    }
    for (final ids in producers.values) {
      if (ids.length > 1) ambiguous.addAll(ids);
    }
    final deletions = <OfflineResourceReference, Set<String>>{};
    for (final node in nodes) {
      if (node.deletes != null) {
        deletions.putIfAbsent(node.deletes!, () => {}).add(node.record.id);
      }
    }
    final previous = <OfflineResourceReference, String>{};
    for (final node in nodes) {
      final edges = <String>{};
      final required = {...node.requiredReferences};
      for (final ref in node.references) {
        if (node.serialIdentity != ref) edges.addAll(deletions[ref] ?? {});
        final creators = producers[ref];
        if (creators != null) {
          required.add(ref);
          if (creators.length != 1) ambiguous.add(node.record.id);
          edges.addAll(creators);
        }
      }
      for (final ref in required) {
        final creators = producers[ref];
        if (creators != null) {
          if (creators.length != 1) ambiguous.add(node.record.id);
          edges.addAll(creators);
        }
      }
      final identity = node.serialIdentity;
      if (identity != null && node.produces == null) {
        final prior = previous[identity];
        if (prior != null) edges.add(prior);
        previous[identity] = node.record.id;
      }
      if (identity != null && node.produces != null) {
        for (final other in nodes) {
          if (other.serialIdentity == identity && other.produces == null) {
            dependencies
                .putIfAbsent(other.record.id, () => {})
                .add(node.record.id);
          }
        }
      }
      dependencies.putIfAbsent(node.record.id, () => {}).addAll(edges);
      requiredByRecord[node.record.id] = required;
    }
    _findCycles();
  }

  late final List<OfflineDependencyNode> nodes;
  final Map<String, Set<String>> dependencies = {};
  final Map<String, Set<OfflineResourceReference>> requiredByRecord = {};
  final Set<String> cycles = {};
  final Set<String> ambiguous = {};

  List<OfflineDependencyNode> ready({
    required Set<String> acknowledged,
    required Set<OfflineResourceReference> mapped,
  }) => nodes
      .where((node) {
        final id = node.record.id;
        if (acknowledged.contains(id) ||
            cycles.contains(id) ||
            ambiguous.contains(id) ||
            node.record.status != PendingMutationStatus.queued) {
          return false;
        }
        if (!(dependencies[id] ?? {}).every(acknowledged.contains)) {
          return false;
        }
        return (requiredByRecord[id] ?? {}).every(
          (ref) => mapped.contains(ref),
        );
      })
      .toList(growable: false);

  void _findCycles() {
    final visited = <String>{};
    final stack = <String>[];
    void visit(String id) {
      final at = stack.indexOf(id);
      if (at >= 0) {
        cycles.addAll(stack.skip(at));
        return;
      }
      if (!visited.add(id)) return;
      stack.add(id);
      (dependencies[id] ?? <String>{}).forEach(visit);
      stack.removeLast();
    }

    for (final node in nodes) {
      visit(node.record.id);
    }
  }
}
