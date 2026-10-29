import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/presentation/backlog_model.dart';
import 'package:mobile/features/mastermind/presentation/home_model.dart';
import 'package:mobile/features/mastermind/presentation/inbox_model.dart';
import 'package:mobile/features/mastermind/presentation/security_rows.dart';
import 'package:mobile/features/mastermind/presentation/work_model.dart';

import '../../../helpers/mastermind_home_fixture.dart';

const _products = ['Tuturuuu', 'Upskii', 'Mastermind'];

SecurityItem _security(Product? product) => SecurityItem(
  title: 'Security issue',
  state: LaneState.open,
  product: product,
);

SnapshotEvent _event(int seq, EventPayload payload) => SnapshotEvent(
  seq: seq,
  ts: DateTime.utc(2026, 1, 1, seq),
  kind: EventKind.needsYou,
  payload: payload,
);

/// [homeJson] with a security row for every product in every section, so the
/// rows would read identically once the product name is gone (SB-100 S3).
Map<String, dynamic> _multiProductJson() {
  final root = homeJson(security: false);
  Map<String, dynamic> row(String product) => {
    'title': 'Security issue',
    'state': 'open',
    'product': product,
  };
  final now = root['now'] as Map<String, dynamic>;
  final rows = [for (final product in _products) row(product)];
  now['needs_you'] = [...(now['needs_you'] as List<dynamic>), ...rows];
  root['lanes'] = [...(root['lanes'] as List<dynamic>), ...rows];
  root['backlog'] = [...(root['backlog'] as List<dynamic>), ...rows];
  return root;
}

void main() {
  group('singleSecurityRow', () {
    test('keeps one row for several products, the first in order', () {
      final rows = singleSecurityRow([
        _security(Product.upskii),
        _security(Product.tuturuuu),
        _security(null),
      ]);
      expect(rows, hasLength(1));
      expect(rows.single.product, Product.upskii);
    });

    test('is empty when the list holds no security row', () {
      expect(singleSecurityRow(const <Object?>[]), isEmpty);
      expect(singleSecurityRow(const <Object?>['a', 1]), isEmpty);
    });
  });

  group('singleSecurityEvent', () {
    test('keeps only the first security event and every other one', () {
      final other = _event(
        1,
        const Receipt(
          product: ReceiptProduct.upskii,
          state: ReceiptState.completed,
          title: 'Receipt',
        ),
      );
      final events = singleSecurityEvent([
        _event(5, _security(Product.upskii)),
        _event(4, _security(Product.tuturuuu)),
        other,
        _event(2, _security(null)),
      ]);
      expect(events.map((e) => e.seq), [5, 1]);
    });
  });

  group('two products produce one security row per list', () {
    final snapshot = parsedSnapshot(_multiProductJson());

    test('Home', () {
      // The parser already refuses a repeated product, so three products is
      // the case that used to render three identical lines.
      expect(snapshot.now.needsYou.whereType<SecurityItem>(), hasLength(3));
      final model = MastermindHomeModel.from(snapshot);
      expect(model.security, hasLength(1));
    });

    test('Inbox For you', () {
      expect(MastermindInboxModel.from(snapshot).security, hasLength(1));
    });

    test('Work lanes', () {
      expect(MastermindWorkModel.from(snapshot).security, hasLength(1));
    });

    test('Backlog', () {
      expect(MastermindBacklogModel.from(snapshot).security, hasLength(1));
    });
  });
}
