import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/ui/ui.dart';

void main() {
  testWidgets('a nonzero range announces the value in its original units', (
    tester,
  ) async {
    final semantics = tester.ensureSemantics();
    await tester.pumpWidget(
      MaterialApp(
        home: AppSlider(
          min: .4,
          value: .6,
          label: 'Opacity',
          semanticFormatter: (value) => '${(value * 100).round()}%',
          onChanged: (_) {},
        ),
      ),
    );
    expect(
      tester.getSemantics(find.byType(AppSlider)).getSemanticsData().value,
      '60%',
    );
    semantics.dispose();
  });
}
