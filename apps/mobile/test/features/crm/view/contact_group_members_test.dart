import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/crm/crm_models.dart';
import 'package:mobile/data/repositories/crm_repository.dart';
import 'package:mobile/features/crm/view/contact_group_members.dart';
import 'package:mocktail/mocktail.dart';

import '../../../helpers/design_render_harness.dart';

class _Repository extends Mock implements CrmRepository {}

void main() {
  for (final theme in ['light', 'dark']) {
    testWidgets('adds and removes an exact group member in $theme', (
      tester,
    ) async {
      final repo = _Repository();
      var added = false;
      when(() => repo.getContactGroupMembersPage('ws', 'group')).thenAnswer(
        (_) async => (
          members: [
            if (added)
              const CrmGroupMember(
                id: 'contact',
                fullName: 'Sample Contact',
                role: 'STUDENT',
              ),
          ],
          next: null,
        ),
      );
      when(
        () => repo.getUsers('ws', query: 'Sample', excludedGroups: ['group']),
      ).thenAnswer(
        (_) async => const CrmUsersResult(
          users: [
            CrmUser(
              id: 'contact',
              workspaceId: 'ws',
              fullName: 'Sample Contact',
            ),
          ],
          count: 1,
        ),
      );
      when(
        () => repo.addContactGroupMember(
          'ws',
          'group',
          'contact',
          role: 'STUDENT',
        ),
      ).thenAnswer((_) async {
        added = true;
      });
      when(
        () => repo.removeContactGroupMember('ws', 'group', 'contact'),
      ).thenAnswer((_) async {
        added = false;
      });
      DesignRender.setSize(tester, DesignRender.sizes['phone']!);
      await tester.runAsync(DesignRender.loadFonts);
      final (settings, brightness) = DesignRender.themes[theme]!;
      await tester.pumpWidget(
        DesignRenderApp(
          settings: settings,
          brightness: brightness,
          child: ContactGroupMembers(
            workspaceId: 'ws',
            group: const CrmGroup(id: 'group', name: 'Sample Group'),
            repository: repo,
            canManage: true,
            canSearch: true,
            confirmRemoval: (_) async => true,
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('No members yet'), findsOneWidget);
      await tester.enterText(find.byType(TextField), 'Sample');
      await tester.tap(find.text('Search'));
      await tester.pumpAndSettle();
      expect(find.text('Sample Contact'), findsOneWidget);
      await tester.tap(find.text('Add'));
      await tester.pumpAndSettle();
      expect(find.text('Sample Contact'), findsOneWidget);
      expect(find.text('Student'), findsOneWidget);
      await DesignRender.capture(tester, 'contacts-group-members-$theme');
      await tester.tap(find.text('Remove'));
      await tester.pumpAndSettle();
      expect(find.text('Sample Contact'), findsNothing);
      expect(find.text('No members yet'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  }
}
