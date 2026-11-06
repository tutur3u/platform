import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/offline_cache_inventory.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/product_feedback/product_feedback_page.dart';
import 'package:mobile/features/settings/view/offline_module_storage_section.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../helpers/design_render_harness.dart';

/// Feedback and offline storage forms: placeholders, grouped rows and
/// readable sizes, rendered for review when `DESIGN_RENDER_DIR` is set.
void main() {
  setUpAll(DesignRender.loadFonts);

  Future<void> pump(
    WidgetTester tester,
    Widget child, {
    required String locale,
    required Brightness brightness,
  }) async {
    DesignRender.setSize(tester, DesignRender.sizes['phone']!);
    await tester.pumpWidget(
      DesignRenderApp(
        settings: DesignRender.themes['light']!.$1,
        brightness: brightness,
        child: Builder(
          builder: (context) => Localizations.override(
            context: context,
            locale: Locale(locale),
            child: child,
          ),
        ),
      ),
    );
  }

  final inventory = OfflineCacheInventory(
    pending: 2,
    namespaces: [
      OfflineNamespaceInventory(
        namespace: 'finance.categories',
        contentRevision: 'r1',
        items: 50,
        snapshots: 2,
        logicalBytes: 48666,
        staleSnapshots: 0,
        expiredSnapshots: 2,
        lastFetch: DateTime(2026, 10, 5, 6, 54),
      ),
      OfflineNamespaceInventory(
        namespace: 'finance.checkpointList',
        contentRevision: 'r2',
        items: 2,
        snapshots: 1,
        logicalBytes: 890935,
        staleSnapshots: 1,
        expiredSnapshots: 0,
        lastFetch: DateTime(2026, 10, 5, 6, 54),
      ),
    ],
  );

  test('collection labels and sizes read naturally', () {
    expect(
      offlineCollectionLabel('finance.checkpointList', 'finance'),
      'Checkpoint list',
    );
    expect(
      offlineCollectionLabel('finance.categories', 'finance'),
      'Categories',
    );
    expect(formatStorageBytes(890935, 'en'), '870 KB');
    expect(formatStorageBytes(48666, 'en'), '47.5 KB');
    expect(formatStorageBytes(512, 'en'), '512 B');
    expect(formatStorageBytes(3 * 1024 * 1024, 'en'), '3.0 MB');
  });

  for (final locale in ['en', 'vi']) {
    for (final brightness in Brightness.values) {
      final suffix = '$locale-${brightness.name}';

      testWidgets('feedback form shows placeholders ($suffix)', (tester) async {
        SharedPreferences.setMockInitialValues({});
        await pump(
          tester,
          ProductFeedbackForm(actor: 'synthetic-actor', isCurrent: () => true),
          locale: locale,
          brightness: brightness,
        );
        await tester.pumpAndSettle();
        final fields = tester.widgetList<AppTextField>(
          find.byType(AppTextField),
        );
        expect(fields, hasLength(2));
        for (final field in fields) {
          expect(field.placeholder, isNotEmpty);
          expect(field.placeholder, isNot(field.label));
        }
        expect(find.byType(AppButton), findsWidgets);
        expect(find.byType(UnderlineInputBorder), findsNothing);
        await DesignRender.capture(tester, 'feedback-$suffix');

        await tester.tap(find.byKey(const ValueKey('feedback-submit')));
        await tester.pumpAndSettle();
        await DesignRender.capture(tester, 'feedback-errors-$suffix');
        expect(tester.takeException(), isNull);
      });

      testWidgets('offline storage reads as grouped rows ($suffix)', (
        tester,
      ) async {
        await pump(
          tester,
          AppPageListView(
            children: [
              OfflineModuleStorageSection(
                moduleId: 'finance',
                inventory: inventory,
                rows: inventory.namespaces,
                store: CacheStore.instance,
                userId: 'synthetic-actor',
                workspaceId: 'synthetic-workspace',
                canEvict: true,
                onEvict: () {},
              ),
            ],
          ),
          locale: locale,
          brightness: brightness,
        );
        await tester.pumpAndSettle();
        expect(find.text('Checkpoint list'), findsOneWidget);
        expect(find.textContaining('payload bytes'), findsNothing);
        await DesignRender.capture(tester, 'offline-finance-$suffix');
        await tester.tap(
          find.byKey(const ValueKey('offline-technical-details')),
        );
        await tester.pumpAndSettle();
        await DesignRender.capture(tester, 'offline-finance-details-$suffix');
        expect(tester.takeException(), isNull);
      });
    }
  }
}
