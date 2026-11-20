import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/crm/crm_models.dart';
import 'package:mobile/features/crm/view/contact_merge_sheet.dart';

import '../../../helpers/design_render_harness.dart';

void main() {
  for (final theme in ['light', 'dark']) {
    testWidgets('bulk merge stops after an unconfirmed pair in $theme', (
      tester,
    ) async {
      final merges = <(String, String)>[];
      var confirm = false;
      int? reviewedCount;
      DesignRender.setSize(tester, DesignRender.sizes['phone']!);
      await tester.runAsync(DesignRender.loadFonts);
      final (settings, brightness) = DesignRender.themes[theme]!;
      await tester.pumpWidget(
        DesignRenderApp(
          settings: settings,
          brightness: brightness,
          child: ContactMergeSheet(
            result: CrmDuplicateDetectionResult(
              totalDuplicates: 3,
              clusters: [
                for (final n in [1, 2, 3])
                  CrmDuplicateCluster(
                    clusterId: n,
                    matchReason: 'Duplicate pair',
                    suggestedTargetId: 'target-$n',
                    users: [
                      CrmDuplicateUser(
                        id: 'source-$n',
                        isLinked: false,
                        fullName: 'Source $n',
                      ),
                      CrmDuplicateUser(
                        id: 'target-$n',
                        isLinked: false,
                        fullName: 'Target $n',
                      ),
                    ],
                  ),
              ],
            ),
            confirmBulkMerge: (count) async {
              reviewedCount = count;
              return confirm;
            },
            onMerge: (source, target) async {
              merges.add((source, target));
              return CrmMergeResult(
                success: source == 'source-1',
                message: source == 'source-1' ? 'success' : 'queued',
              );
            },
          ),
        ),
      );
      final mergeButton = find.text('Merge reviewed pairs');
      await tester.tap(mergeButton);
      await tester.pumpAndSettle();
      expect(reviewedCount, 3);
      expect(merges, isEmpty);

      confirm = true;
      await tester.tap(mergeButton);
      await tester.pumpAndSettle();
      expect(merges, [('source-1', 'target-1'), ('source-2', 'target-2')]);
      expect(find.textContaining('Stopped after 1 of 3'), findsOneWidget);
      expect(mergeButton, findsNothing);
      expect(tester.takeException(), isNull);
      await DesignRender.capture(tester, 'contacts-bulk-merge-$theme');
    });
  }
}
