import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/offline_dependency_graph.dart';
import 'package:mobile/core/cache/offline_resource_reference.dart';
import 'package:mobile/core/cache/pending_mutation_record.dart';

OfflineResourceReference ref(
  String id, {
  String user = 'user',
  String ws = 'ws',
  String feature = 'inventory',
  String resource = 'category',
}) => OfflineResourceReference(
  userId: user,
  workspaceId: ws,
  feature: feature,
  resource: resource,
  localId: id,
);

OfflineDependencyNode node(
  String id,
  int order, {
  OfflineResourceReference? produces,
  OfflineResourceReference? serial,
  Set<OfflineResourceReference> refs = const {},
  Set<OfflineResourceReference> required = const {},
  PendingMutationStatus status = PendingMutationStatus.queued,
}) => OfflineDependencyNode(
  record: PendingMutationRecord(
    id: id,
    feature: 'inventory',
    method: 'POST',
    path: '/api/test',
    createdAt: DateTime.utc(2026).add(Duration(seconds: order)),
    userId: 'user',
    workspaceId: 'ws',
    status: status,
  ),
  produces: produces,
  serialIdentity: serial,
  references: refs,
  requiredReferences: required,
);

List<String> ready(
  OfflineDependencyGraph graph, {
  Set<String> done = const {},
  Set<OfflineResourceReference> mapped = const {},
}) => graph
    .ready(acknowledged: done, mapped: mapped)
    .map((value) => value.record.id)
    .toList();

void main() {
  test('later prerequisites run first while independent writes progress', () {
    final category = ref('local');
    final graph = OfflineDependencyGraph([
      node('product', 0, refs: {category}),
      node('independent', 1),
      node('category', 2, produces: category),
    ]);
    expect(ready(graph), ['independent', 'category']);
    expect(ready(graph, done: {'category'}), ['independent']);
    expect(ready(graph, done: {'category'}, mapped: {category}), [
      'product',
      'independent',
    ]);
  });

  test('create acknowledgment does not skip earlier per-entity updates', () {
    final product = ref('local', resource: 'product');
    final graph = OfflineDependencyGraph([
      node('edit1', 0, serial: product, refs: {product}),
      node('edit2', 1, serial: product, refs: {product}),
      node('create', 2, produces: product, serial: product),
      node('edit3', 3, serial: product, refs: {product}),
    ]);
    expect(ready(graph), ['create']);
    expect(ready(graph, done: {'create'}, mapped: {product}), ['edit1']);
    expect(ready(graph, done: {'create', 'edit1'}, mapped: {product}), [
      'edit2',
    ]);
    expect(
      ready(graph, done: {'create', 'edit1', 'edit2'}, mapped: {product}),
      ['edit3'],
    );
  });

  test('failed prerequisite blocks its consumers but not unrelated writes', () {
    final category = ref('local');
    final graph = OfflineDependencyGraph([
      node(
        'category',
        0,
        produces: category,
        status: PendingMutationStatus.failed,
      ),
      node('product', 1, refs: {category}),
      node('unrelated', 2),
    ]);
    expect(ready(graph), ['unrelated']);
  });

  test('same local ID in another account workspace feature or resource '
      'is independent', () {
    final wanted = ref('same');
    final others = [
      ref('same', user: 'other'),
      ref('same', ws: 'other'),
      ref('same', feature: 'finance'),
      ref('same', resource: 'unit'),
    ];
    final graph = OfflineDependencyGraph([
      node('product', 0, refs: {wanted}),
      for (var i = 0; i < others.length; i++)
        node(
          'other$i',
          i + 1,
          produces: others[i],
          status: PendingMutationStatus.failed,
        ),
    ]);
    expect(ready(graph), ['product']);
    expect(graph.requiredByRecord['product'], isEmpty);
  });

  test('persisted missing local dependency stays blocked '
      'until its exact map exists', () {
    final category = ref('missing');
    final graph = OfflineDependencyGraph([
      node('product', 0, required: {category}),
    ]);
    expect(ready(graph), isEmpty);
    expect(ready(graph, mapped: {ref('missing', resource: 'unit')}), isEmpty);
    expect(ready(graph, mapped: {category}), ['product']);
  });

  test(
    'cycle and dependent writes stay retained while independent work is ready',
    () {
      final a = ref('a');
      final b = ref('b');
      final graph = OfflineDependencyGraph([
        node('a', 0, produces: a, refs: {b}),
        node('b', 1, produces: b, refs: {a}),
        node('dependent', 2, refs: {a}),
        node('independent', 3),
      ]);
      expect(graph.cycles, {'a', 'b'});
      expect(ready(graph), ['independent']);
    },
  );

  test(
    'ambiguous duplicate creates are never arbitrarily chosen for dispatch',
    () {
      final category = ref('local');
      final graph = OfflineDependencyGraph([
        node('one', 0, produces: category),
        node('two', 1, produces: category),
        node('product', 2, refs: {category}),
      ]);
      expect(graph.ambiguous, {'one', 'two', 'product'});
      expect(ready(graph), isEmpty);
    },
  );
}
