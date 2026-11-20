import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/finance/finance_invoice.dart';
import 'package:mobile/data/repositories/crm_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/crm/view/contact_billing.dart';
import 'package:mocktail/mocktail.dart';

import '../../../helpers/design_render_harness.dart';

class _Repository extends Mock implements CrmRepository {}

void main() {
  for (final theme in ['light', 'dark']) {
    testWidgets('loads exact-contact billing with pagination in $theme', (
      tester,
    ) async {
      final repo = _Repository();
      when(
        () => repo.getContactInvoices('workspace', 'contact', page: 1),
      ).thenAnswer(
        (_) async => (
          items: const [
            FinanceInvoice(id: 'first', notice: 'November', total: 200000),
          ],
          count: 11,
          outstanding: 120000.0,
        ),
      );
      when(
        () => repo.getContactInvoices('workspace', 'contact', page: 2),
      ).thenAnswer(
        (_) async => (
          items: const [
            FinanceInvoice(id: 'second', notice: 'October', total: 150000),
          ],
          count: 11,
          outstanding: null,
        ),
      );
      DesignRender.setSize(tester, DesignRender.sizes['phone']!);
      await tester.runAsync(DesignRender.loadFonts);
      final (settings, brightness) = DesignRender.themes[theme]!;
      await tester.pumpWidget(
        DesignRenderApp(
          settings: settings,
          brightness: brightness,
          child: ContactBilling(
            workspaceId: 'workspace',
            contactId: 'contact',
            repository: repo,
          ),
        ),
      );
      verifyZeroInteractions(repo);
      await tester.tap(find.text('Invoices'));
      await tester.pumpAndSettle();
      expect(find.text('Outstanding subscriptions'), findsOneWidget);
      expect(find.text('November'), findsOneWidget);
      await tester.tap(find.text('Load more'));
      await tester.pumpAndSettle();
      expect(find.text('November'), findsOneWidget);
      expect(find.text('October'), findsOneWidget);
      expect(find.text('Load more'), findsNothing);
      expect(tester.takeException(), isNull);
      await DesignRender.capture(tester, 'contacts-billing-$theme');

      await tester.tap(find.text('Invoices'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Invoices'));
      await tester.pumpAndSettle();
      verify(
        () => repo.getContactInvoices('workspace', 'contact', page: 1),
      ).called(2);
      expect(find.text('October'), findsNothing);

      when(
        () => repo.getContactInvoices('workspace', 'contact', page: 2),
      ).thenThrow(
        ApiException(
          statusCode: theme == 'light' ? 404 : 403,
          message: 'Unavailable',
        ),
      );
      await tester.tap(find.text('Load more'));
      await tester.pumpAndSettle();
      expect(find.text('November'), findsNothing);
      expect(find.text('Outstanding subscriptions'), findsNothing);
    });
  }
}
