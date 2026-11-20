import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/crm/crm_models.dart';
import 'package:mobile/features/crm/view/contact_csv_export_sheet.dart';
import 'package:mobile/features/crm/view/contact_csv_import_preview.dart';

import '../../../helpers/design_render_harness.dart';

void main() {
  for (final theme in ['light', 'dark']) {
    testWidgets('CSV preview pages and respects column visibility in $theme', (
      tester,
    ) async {
      DesignRender.setSize(tester, DesignRender.sizes['phone']!);
      await tester.runAsync(DesignRender.loadFonts);
      final (settings, brightness) = DesignRender.themes[theme]!;
      await tester.pumpWidget(
        DesignRenderApp(
          settings: settings,
          brightness: brightness,
          child: ContactCsvImportPreview(
            rows: [
              for (var i = 1; i <= 11; i++)
                {'fullName': 'Example $i', 'email': 'example$i@example.com'},
            ],
            skipped: 2,
          ),
        ),
      );
      expect(find.text('Page 1 of 2'), findsOneWidget);
      await tester.ensureVisible(find.text('Next'));
      await tester.tap(find.text('Next'));
      await tester.pumpAndSettle();
      expect(find.text('Example 11'), findsOneWidget);
      expect(find.text('2 invalid or duplicate rows skipped.'), findsOneWidget);
      await DesignRender.capture(tester, 'contacts-csv-import-$theme');

      await tester.pumpWidget(
        DesignRenderApp(
          settings: settings,
          brightness: brightness,
          child: const ContactCsvExportSheet(
            permissions: CrmUserPermissions(
              hasPublicInfo: true,
              hasPrivateInfo: false,
              canCheckUserAttendance: false,
            ),
            initialStatus: 'active',
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('CSV columns'), findsOneWidget);
      expect(find.text('Full name'), findsOneWidget);
      expect(find.text('National ID'), findsNothing);
      await DesignRender.capture(tester, 'contacts-csv-export-$theme');
    });
  }
}
