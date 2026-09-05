import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/widgets/shadcn_flutter_compat.dart' as shad;
import 'package:mobile/core/widgets/shadcn_material_bridge.dart';

void main() {
  testWidgets('showDialog preserves the typed dialog result', (tester) async {
    late BuildContext hostContext;

    await tester.pumpWidget(
      shad.ShadcnApp(
        theme: const shad.ThemeData(colorScheme: shad.ColorSchemes.lightZinc),
        localizationsDelegates: const [shad.ShadcnLocalizations.delegate],
        builder: ShadcnMaterialBridge.appBuilder,
        home: Builder(
          builder: (context) {
            hostContext = context;
            return const SizedBox.shrink();
          },
        ),
      ),
    );

    final result = shad.showDialog<int>(
      context: hostContext,
      builder: (context) => const Center(child: Text('Compatibility dialog')),
    );
    await tester.pumpAndSettle();

    expect(find.text('Compatibility dialog'), findsOneWidget);

    Navigator.of(hostContext, rootNavigator: true).pop(42);
    await tester.pumpAndSettle();

    await expectLater(result, completion(42));
  });
}
