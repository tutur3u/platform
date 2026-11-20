import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mastermind/machines/machine_sample.dart';
import '../../../helpers/mastermind_snapshot_builder.dart';
import '../../../helpers/mastermind_work_pump.dart';

Map<String, dynamic> root() {
  final json = MastermindSnapshotBuilder.defaults().toJson();
  json['machines'] = machineSample['machines'];
  json['machines_meta'] = machineSample['machines_meta'];
  return json;
}

void main() {
  testWidgets('direct missing machine route has a stable gone state', (
    tester,
  ) async {
    final router = workRouter('/mastermind/work/machine/m-aaaaaaaaaaaa');
    await pumpWork(tester, root(), router: router);
    expect(find.text('This machine is no longer reported'), findsOneWidget);
    expect(find.byType(AppBar), findsNothing);
  });
}
