import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/auth/widgets/security_check_dialog.dart';

import '../../../helpers/helpers.dart';

void main() {
  testWidgets('retry rejects stale tokens and completes only once', (
    tester,
  ) async {
    final callbacks = <ValueChanged<String>>[];
    String? result;
    var completed = 0;
    await tester.pumpApp(
      Builder(
        builder: (context) => TextButton(
          onPressed: () async {
            result = await showDialog<String>(
              context: context,
              builder: (_) => SecurityCheckDialog(
                challengeBuilder: (key, onToken, onFailure) {
                  if (callbacks.length <= (key as ValueKey<int>).value) {
                    callbacks.add(onToken);
                  }
                  return TextButton(
                    onPressed: onFailure,
                    child: const Text('Fail'),
                  );
                },
              ),
            );
            completed++;
          },
          child: const Text('Verify'),
        ),
      ),
    );
    await tester.tap(find.text('Verify'));
    await tester.pumpAndSettle();
    expect(find.byType(Dialog), findsOneWidget);
    callbacks.first('');
    await tester.pump();
    expect(find.byType(Dialog), findsOneWidget);
    await tester.tap(find.text('Fail'));
    await tester.pump();
    await tester.tap(find.text('Retry'));
    await tester.pump();
    expect(callbacks, hasLength(2));
    callbacks.first('stale-token');
    await tester.pump();
    expect(find.byType(Dialog), findsOneWidget);
    callbacks.last('fresh-token');
    callbacks.last('duplicate-token');
    await tester.pumpAndSettle();
    expect(result, 'fresh-token');
    expect(completed, 1);
    expect(find.text('Verify'), findsOneWidget);
  });

  testWidgets('closing cancels verification without a token', (tester) async {
    String? result = 'not-completed';
    await tester.pumpApp(
      Builder(
        builder: (context) => TextButton(
          onPressed: () async {
            result = await showDialog<String>(
              context: context,
              builder: (_) => SecurityCheckDialog(
                challengeBuilder: (_, _, _) => const SizedBox(height: 60),
              ),
            );
          },
          child: const Text('Verify'),
        ),
      ),
    );
    await tester.tap(find.text('Verify'));
    await tester.pumpAndSettle();
    await tester.tap(find.byType(CloseButton));
    await tester.pumpAndSettle();
    expect(result, isNull);
    expect(find.byType(Dialog), findsNothing);
  });
}
