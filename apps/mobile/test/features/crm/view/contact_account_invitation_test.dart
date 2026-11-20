import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/crm/crm_models.dart';
import 'package:mobile/features/crm/view/contact_account_invitation.dart';

import '../../../helpers/design_render_harness.dart';

void main() {
  for (final theme in ['light', 'dark']) {
    testWidgets('creates and shares only the selected invitation in $theme', (
      tester,
    ) async {
      final created = <String>[];
      final shared = <Uri>[];
      final link = Uri.https('example.invalid', '/contact-link');
      DesignRender.setSize(tester, DesignRender.sizes['phone']!);
      await tester.runAsync(DesignRender.loadFonts);
      final (settings, brightness) = DesignRender.themes[theme]!;
      await tester.pumpWidget(
        DesignRenderApp(
          settings: settings,
          brightness: brightness,
          child: ContactAccountInvitation(
            loadAccounts: () async => const [
              CrmLinkedUser(id: 'account-1', displayName: 'Sample account'),
              CrmLinkedUser(id: 'account-2', displayName: 'Other account'),
            ],
            createInvitation: (accountId) async {
              created.add(accountId);
              return link;
            },
            revokeInvitation: () async {},
            shareInvitation: (uri, _) async {
              shared.add(uri);
            },
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Sample account'));
      await tester.pumpAndSettle();
      expect(created, isEmpty);
      await tester.tap(find.text('Create invitation'));
      await tester.pumpAndSettle();
      expect(created, ['account-1']);
      expect(shared, isEmpty);
      await DesignRender.capture(tester, 'contacts-account-invitation-$theme');
      await tester.tap(find.text('Share invitation'));
      await tester.pumpAndSettle();
      expect(shared, [link]);
      expect(tester.takeException(), isNull);
    });
  }
}
