import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/time_tracker/widgets/threshold_settings_dialog.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

import '../../../helpers/helpers.dart';

void main() {
  group('ThresholdSettingsDialog', () {
    testWidgets('submits numeric threshold value', (tester) async {
      int? savedThreshold;
      int? savedGracePeriod;

      await tester.pumpApp(
        Scaffold(
          body: ThresholdSettingsDialog(
            currentThreshold: 2,
            currentStatusChangeGracePeriodMinutes: 5,
            onSave: (threshold, gracePeriod) async {
              savedThreshold = threshold;
              savedGracePeriod = gracePeriod;
            },
          ),
        ),
      );

      final inputs = find.byType(EditableText);
      expect(inputs, findsNWidgets(2));
      expect(find.text('5'), findsOneWidget);

      await tester.enterText(inputs.first, '4');
      await tester.enterText(inputs.last, '9');
      await tester.tap(find.text('Save'));
      await tester.pumpAndSettle();

      expect(savedThreshold, 4);
      expect(savedGracePeriod, 9);
    });

    testWidgets('submits null when no approval is enabled', (tester) async {
      int? savedThreshold = 99;
      int? savedGracePeriod;

      await tester.pumpApp(
        Scaffold(
          body: ThresholdSettingsDialog(
            currentThreshold: 3,
            currentStatusChangeGracePeriodMinutes: 5,
            onSave: (threshold, gracePeriod) async {
              savedThreshold = threshold;
              savedGracePeriod = gracePeriod;
            },
          ),
        ),
      );

      final inputs = find.byType(EditableText);
      expect(inputs, findsNWidgets(2));
      expect(find.text('5'), findsOneWidget);

      await tester.tap(find.byType(shad.Switch));
      await tester.pump();
      final graceInput = find.byType(EditableText);
      expect(graceInput, findsOneWidget);
      await tester.enterText(graceInput, '11');
      await tester.tap(find.text('Save'));
      await tester.pumpAndSettle();

      expect(savedThreshold, isNull);
      expect(savedGracePeriod, 11);
    });
  });
}
