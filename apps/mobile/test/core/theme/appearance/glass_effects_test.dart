import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/theme/appearance/glass_effects.dart';
import 'package:mobile/features/shell/view/shell_dock_surface.dart';

Widget _dock({bool highContrast = false}) => MaterialApp(
  home: MediaQuery(
    data: MediaQueryData(highContrast: highContrast),
    child: const Center(
      child: SizedBox(
        width: 240,
        height: 64,
        child: ShellDockSurface(child: Text('dock')),
      ),
    ),
  ),
);

Widget _glass({bool highContrast = false}) => MaterialApp(
  home: MediaQuery(
    data: MediaQueryData(highContrast: highContrast),
    child: const Center(
      child: ClipRect(child: GlassBlur(sigma: 24, child: Text('glass'))),
    ),
  ),
);

double _fillAlpha(WidgetTester tester) {
  final box = tester.widget<Container>(
    find.descendant(
      of: find.byType(ShellDockSurface),
      matching: find.byType(Container),
    ),
  );
  return (box.decoration! as BoxDecoration).color!.a;
}

/// Counts composited backdrop layers, i.e. the per-frame blur passes.
int _backdropLayers(WidgetTester tester) {
  var count = 0;
  void visit(Layer? layer) {
    if (layer == null) return;
    if (layer is BackdropFilterLayer) count++;
    if (layer is ContainerLayer) {
      var child = layer.firstChild;
      while (child != null) {
        visit(child);
        child = child.nextSibling;
      }
    }
  }

  for (final view in tester.binding.renderViews) {
    visit(view.debugLayer);
  }
  return count;
}

void main() {
  tearDown(() => GlassEffects.debugBlurOverride = null);

  testWidgets('the dock is solid on every platform (mobile.dockBlur 0)', (
    tester,
  ) async {
    await tester.pumpWidget(_dock());
    expect(find.byType(BackdropFilter), findsNothing);
    expect(_backdropLayers(tester), 0);
    expect(_fillAlpha(tester), 1);
  }, variant: TargetPlatformVariant.all());

  testWidgets('high contrast keeps the dock opaque', (tester) async {
    GlassEffects.debugBlurOverride = true;
    await tester.pumpWidget(_dock(highContrast: true));
    expect(find.byType(BackdropFilter), findsNothing);
    expect(_fillAlpha(tester), 1);
  });

  testWidgets('glass blurs only where the platform keeps it', (tester) async {
    await tester.pumpWidget(_glass());
    final android = defaultTargetPlatform == TargetPlatform.android;
    expect(
      find.byType(BackdropFilter),
      android ? findsNothing : findsOneWidget,
    );
    expect(_backdropLayers(tester), android ? 0 : 1);
  }, variant: TargetPlatformVariant.all());

  testWidgets('the debug override restores the blur on Android', (
    tester,
  ) async {
    GlassEffects.debugBlurOverride = true;
    await tester.pumpWidget(_glass());
    expect(defaultTargetPlatform, TargetPlatform.android);
    expect(find.byType(BackdropFilter), findsOneWidget);
    expect(_backdropLayers(tester), 1);
  });

  testWidgets('high contrast glass is opaque and never blurs', (tester) async {
    GlassEffects.debugBlurOverride = true;
    await tester.pumpWidget(_glass(highContrast: true));
    expect(find.byType(BackdropFilter), findsNothing);
    final context = tester.element(find.text('glass'));
    expect(GlassEffects.fillAlpha(context, 0.72), 1);
  });
}
