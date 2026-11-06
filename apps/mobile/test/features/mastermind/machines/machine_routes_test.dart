import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mastermind/machines/machine_sample.dart';
import 'package:mobile/features/mastermind/presentation/work_model.dart';
import '../../../helpers/mastermind_snapshot_builder.dart';
import '../../../helpers/mastermind_work_pump.dart';

Map<String, dynamic> root() {
  final json = MastermindSnapshotBuilder.defaults().toJson();
  json['machines'] = machineSample['machines'];
  json['machines_meta'] = machineSample['machines_meta'];
  return json;
}

void main() {
  testWidgets('fourth segment URL pushes detail and returns to Machines', (
    tester,
  ) async {
    machineSampleEnabled.value = false;
    final router = workRouter('/mastermind/work?segment=machines');
    await pumpWork(
      tester,
      root(),
      router: router,
      segment: WorkSegment.machines,
    );
    expect(find.text('Machines'), findsOneWidget);
    await tester.tap(find.text('SSET Mac Studio'));
    await tester.pumpAndSettle();
    expect(workUri(router).path, '/mastermind/work/machine/m-000000000001');
    expect(find.text('Now'), findsOneWidget);
    router.pop();
    await tester.pumpAndSettle();
    expect(workUri(router).queryParameters['segment'], 'machines');
    expect(find.text('SSET Mac Studio'), findsOneWidget);
  });
  testWidgets('direct missing machine route has a stable gone state', (
    tester,
  ) async {
    final router = workRouter('/mastermind/work/machine/m-aaaaaaaaaaaa');
    await pumpWork(tester, root(), router: router);
    expect(find.text('This machine is no longer reported'), findsOneWidget);
    expect(find.byType(AppBar), findsNothing);
  });
}
