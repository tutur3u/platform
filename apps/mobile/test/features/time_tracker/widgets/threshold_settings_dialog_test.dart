import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/time_tracker/widgets/threshold_settings_dialog.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

import '../../../helpers/helpers.dart';

void main() {
  group('ThresholdSettingsDialog', () {
    testWidgets('submits numeric threshold value', (tester) async {
      int? savedThreshold;

      await tester.pumpApp(
        Scaffold(
          body: ThresholdSettingsDialog(
            currentThreshold: 2,
            currentStatusChangeGracePeriodMinutes: 5,
            onSave: (threshold, _) async {
              savedThreshold = threshold;
            },
          ),
        ),
      );

      await tester.enterText(find.byType(EditableText).first, '4');
      await tester.tap(find.text('Save'));
      await tester.pumpAndSettle();

      expect(savedThreshold, 4);
    });

    testWidgets('submits null when no approval is enabled', (tester) async {
      int? savedThreshold = 99;

      await tester.pumpApp(
        Scaffold(
          body: ThresholdSettingsDialog(
            currentThreshold: 3,
            currentStatusChangeGracePeriodMinutes: 5,
            onSave: (threshold, _) async {
              savedThreshold = threshold;
            },
          ),
        ),
      );

      await tester.tap(find.byType(shad.Switch));
      await tester.pump();
      await tester.tap(find.text('Save'));
      await tester.pumpAndSettle();

      expect(savedThreshold, isNull);
    });
  });
}
