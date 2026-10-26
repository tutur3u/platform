import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/responsive/breakpoints.dart';
import 'package:mobile/core/theme/mobile_shad_theme.dart';
import 'package:mobile/core/widgets/shadcn_localizations_fallback.dart';
import 'package:mobile/core/widgets/shadcn_material_bridge.dart';
import 'package:mobile/features/finance/view/finance_page.dart';
import 'package:mobile/features/inventory/widgets/inventory_ui.dart';
import 'package:mobile/features/product_feedback/product_feedback_page.dart';
import 'package:mobile/features/product_feedback/product_feedback_repository.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;
import 'package:shared_preferences/shared_preferences.dart';

class _FeedbackRepository extends Mock implements ProductFeedbackRepository {}

const ValueKey<String> _renderKey = ValueKey('page-padding-render');

/// Dock clearance the shell publishes as `MediaQuery.padding.bottom`.
const double _dockClearance = 96;

/// Phone, portrait tablet, landscape tablet and desktop body widths.
const List<(String, Size)> _viewports = [
  ('phone', Size(390, 844)),
  ('tablet-portrait', Size(768, 1024)),
  ('tablet-landscape', Size(1194, 834)),
  ('desktop', Size(1440, 900)),
];

final List<(String, AppPageKind, Widget Function())> _screens = [
  ('finance-overview', AppPageKind.detail, FinanceOverviewSkeleton.new),
  ('inventory-overview', AppPageKind.detail, InventoryOverviewSkeleton.new),
  (
    'product-feedback',
    AppPageKind.form,
    () => ProductFeedbackForm(
      actor: '11111111-1111-4111-8111-111111111111',
      isCurrent: () => true,
      repository: _FeedbackRepository(),
      verify: (_) async => 'token',
    ),
  ),
];

/// Width of a synthetic leading rail that narrows the page body.
const double _railWidth = 96;

/// Expects the page's content box to match the shared insets for [bodyWidth].
void _expectInsets(
  WidgetTester tester, {
  required double bodyWidth,
  required AppPageKind kind,
}) {
  final expected = AppPageInsets.resolve(
    width: bodyWidth,
    kind: kind,
    bottom: _dockClearance + AppLayout.scrollEndGap,
  );
  final list = find.byType(ListView).first;
  final padding = tester
      .widget<ListView>(list)
      .padding!
      .resolve(TextDirection.ltr);
  expect(padding, expected);
  // The scrollable keeps the full body width; only padding centres content.
  expect(tester.getSize(list).width, bodyWidth);

  final deviceClass = Breakpoints.fromWidth(bodyWidth);
  final gutter = AppLayout.gutter(deviceClass);
  final maxWidth = AppLayout.maxContentWidth(kind, deviceClass);
  final contentWidth = bodyWidth - padding.horizontal;
  if (maxWidth == null || bodyWidth <= maxWidth) {
    // Narrower than the kind's box: the content fills the body inside gutters.
    expect(contentWidth, bodyWidth - 2 * gutter);
  } else {
    // The box is capped at the kind's max width, gutters included.
    expect(contentWidth, maxWidth - 2 * gutter);
  }
}

Future<void> _pump(
  WidgetTester tester,
  Size size,
  Widget page, {
  double railWidth = 0,
}) async {
  tester.view
    ..devicePixelRatio = 1
    ..physicalSize = size;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    RepaintBoundary(
      key: _renderKey,
      child: shad.ShadcnApp(
        debugShowCheckedModeBanner: false,
        // The app's real theme, so captures use its NotoSans typography.
        theme: MobileShadTheme.light,
        localizationsDelegates: const [
          ...AppLocalizations.localizationsDelegates,
          AppShadcnLocalizationsDelegate(),
        ],
        supportedLocales: AppLocalizations.supportedLocales,
        builder: ShadcnMaterialBridge.appBuilder,
        home: Builder(
          builder: (context) => MediaQuery(
            data: MediaQuery.of(
              context,
            ).copyWith(padding: const EdgeInsets.only(bottom: _dockClearance)),
            child: Material(
              child: Row(
                children: [
                  SizedBox(width: railWidth),
                  Expanded(child: page),
                ],
              ),
            ),
          ),
        ),
      ),
    ),
  );
  await tester.pump();
  // Let async preferences resolve so controls render their enabled state.
  await tester.pump(const Duration(milliseconds: 300));
}

Future<void> _capture(WidgetTester tester, String name) async {
  final output = Platform.environment['DESIGN_RENDER_DIR'];
  if (output == null) return;
  await tester.runAsync(() async {
    final boundary = tester.renderObject<RenderRepaintBoundary>(
      find.byKey(_renderKey),
    );
    final image = await boundary.toImage();
    final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
    await Directory(output).create(recursive: true);
    await File('$output/$name.png').writeAsBytes(bytes!.buffer.asUint8List());
    image.dispose();
  });
}

void main() {
  setUpAll(() async {
    for (final family in ['NotoSans', 'Roboto']) {
      await (FontLoader(
        family,
      )..addFont(rootBundle.load('assets/fonts/NotoSans.ttf'))).load();
    }
    await (FontLoader(
      'MaterialIcons',
    )..addFont(rootBundle.load('fonts/MaterialIcons-Regular.otf'))).load();
  });
  setUp(() => SharedPreferences.setMockInitialValues({}));

  for (final (screen, kind, build) in _screens) {
    for (final (viewport, size) in _viewports) {
      testWidgets('$screen uses shared page insets on $viewport', (
        tester,
      ) async {
        await _pump(tester, size, build());
        _expectInsets(tester, bodyWidth: size.width, kind: kind);

        await _capture(tester, '$screen-$viewport');
      });
    }

    testWidgets('$screen resolves insets from the rail-narrowed body', (
      tester,
    ) async {
      // An expanded window whose body falls into the medium class once the
      // rail takes its share: gutters and max width follow the body.
      const size = Size(900, 1024);
      const bodyWidth = 900 - _railWidth;
      expect(Breakpoints.fromWidth(size.width), DeviceClass.expanded);
      expect(Breakpoints.fromWidth(bodyWidth), DeviceClass.medium);

      await _pump(tester, size, build(), railWidth: _railWidth);
      _expectInsets(tester, bodyWidth: bodyWidth, kind: kind);
    });
  }
}
