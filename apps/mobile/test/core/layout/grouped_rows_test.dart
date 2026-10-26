import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/ui.dart';

Widget _host(Widget child, {AppColorTokens tokens = AppColorTokens.light}) =>
    MaterialApp(
      theme: ThemeData(brightness: tokens.brightness, extensions: [tokens]),
      home: Scaffold(body: Center(child: child)),
    );

void main() {
  test('tones resolve to theme roles, never fixed hues', () {
    for (final colors in [AppColorTokens.light, AppColorTokens.dark]) {
      expect(AppTone.success.foreground(colors), colors.success);
      expect(AppTone.warning.foreground(colors), colors.warning);
      expect(AppTone.destructive.foreground(colors), colors.destructive);
      expect(AppTone.info.foreground(colors), colors.info);
      expect(AppTone.primary.foreground(colors), colors.primary);
      expect(AppTone.neutral.fill(colors), colors.muted);
      expect(
        AppTone.success.fill(colors),
        colors.success.withValues(alpha: colors.isDark ? 0.2 : 0.12),
      );
    }
  });

  testWidgets('grouped rows keep the row height and a whole-row target', (
    tester,
  ) async {
    var taps = 0;
    await tester.pumpWidget(
      _host(
        SizedBox(
          width: 360,
          child: AppGroupedCard(
            children: [
              AppGroupedRow(
                leading: const AppIconTile(icon: LucideIcons.bell),
                title: const Text('Synthetic row'),
                showChevron: true,
                onTap: () => taps++,
              ),
            ],
          ),
        ),
      ),
    );

    final row = find.byType(AppGroupedRow);
    expect(
      tester.getSize(row).height,
      greaterThanOrEqualTo(AppLayout.rowMinHeight),
    );
    await tester.tapAt(tester.getTopRight(row) + const Offset(-4, 4));
    expect(taps, 1);
    expect(
      tester.getSemantics(row),
      isSemantics(isButton: true, hasTapAction: true, label: 'Synthetic row'),
    );
  });

  testWidgets('state messages render an action in both layouts', (
    tester,
  ) async {
    var retries = 0;
    for (final inline in [false, true]) {
      final message = inline
          ? AppStateMessage.inline(
              icon: LucideIcons.cloudOff,
              tone: AppTone.destructive,
              title: 'Synthetic failure',
              message: 'Synthetic detail',
              actionLabel: 'Retry',
              onAction: () => retries++,
            )
          : AppStateMessage(
              icon: LucideIcons.cloudOff,
              tone: AppTone.destructive,
              title: 'Synthetic failure',
              message: 'Synthetic detail',
              actionLabel: 'Retry',
              onAction: () => retries++,
            );
      await tester.pumpWidget(
        _host(
          SizedBox(width: 360, child: message),
          tokens: AppColorTokens.dark,
        ),
      );
      expect(find.text('Synthetic failure'), findsOneWidget);
      expect(find.text('Synthetic detail'), findsOneWidget);
      await tester.tap(find.text('Retry'));
      await tester.pump();
    }
    expect(retries, 2);
  });
}
