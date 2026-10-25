import 'package:flutter_test/flutter_test.dart';

import '../../../helpers/design_render_harness.dart';
import 'kit_gallery_boards.dart';

/// Every kit component at phone, tablet and desktop sizes in light, dark and
/// a blob theme. Asserts layout, tap targets and text contrast; writes PNGs
/// to `DESIGN_RENDER_DIR` when it is set.
void main() {
  setUpAll(DesignRender.loadFonts);

  for (final size in DesignRender.sizes.entries) {
    for (final theme in DesignRender.themes.entries) {
      for (final board in KitBoard.values) {
        final name = 'kit-${board.name}-${size.key}-${theme.key}';
        testWidgets(name, (tester) async {
          DesignRender.setSize(tester, size.value);
          final (settings, brightness) = theme.value;
          await tester.pumpWidget(
            DesignRenderApp(
              settings: settings,
              brightness: brightness,
              child: KitGalleryBoard(board),
            ),
          );
          await tester.pumpAndSettle();
          expect(tester.takeException(), isNull);
          await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
          await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
          await expectLater(tester, meetsGuideline(textContrastGuideline));
          await DesignRender.capture(tester, name);
        });
      }
    }
  }
}
