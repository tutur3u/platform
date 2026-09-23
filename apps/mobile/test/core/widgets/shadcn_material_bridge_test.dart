import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/theme/app_theme.dart';
import 'package:mobile/core/widgets/shadcn_material_bridge.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

void main() {
  testWidgets('provides Material infrastructure below ShadcnApp', (
    tester,
  ) async {
    await tester.pumpWidget(
      const shad.ShadcnApp(
        theme: shad.ThemeData(colorScheme: shad.ColorSchemes.lightZinc),
        home: ShadcnMaterialBridge(
          child: Scaffold(body: InkWell(child: Text('Material content'))),
        ),
      ),
    );

    final context = tester.element(find.text('Material content'));

    expect(Material.maybeOf(context), isNotNull);
    expect(ScaffoldMessenger.maybeOf(context), isNotNull);
    expect(tester.takeException(), isNull);
  });

  test('dark snackbars use a dark surface with readable text', () {
    final theme = AppTheme.dark.snackBarTheme;
    expect(theme.behavior, SnackBarBehavior.floating);
    expect(
      theme.backgroundColor,
      AppTheme.dark.colorScheme.surfaceContainerHigh,
    );
    expect(theme.contentTextStyle?.color, AppTheme.dark.colorScheme.onSurface);
    expect(theme.actionTextColor, AppTheme.dark.colorScheme.primary);
  });
}
