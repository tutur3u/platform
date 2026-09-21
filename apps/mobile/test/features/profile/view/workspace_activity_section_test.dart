import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/repositories/profile_activity_repository.dart';
import 'package:mobile/features/profile/view/workspace_activity_section.dart';
import 'package:mocktail/mocktail.dart';
import '../../../helpers/helpers.dart';

class _Repository extends Mock implements ProfileActivityRepository {}

void main() {
  for (final width in [390.0, 1032.0]) {
    testWidgets('private by default and sharing requires consent at $width', (
      tester,
    ) async {
      tester.view.physicalSize = Size(width, 1000);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final repository = _Repository();
      var shared = false;
      when(() => repository.load('workspace')).thenAnswer(
        (_) async => {
          'sharing': shared,
          'members': <Map<String, dynamic>>[],
          'next': null,
        },
      );
      when(
        () =>
            repository.setSharing('workspace', sharing: any(named: 'sharing')),
      ).thenAnswer((invocation) async {
        shared = invocation.namedArguments[#sharing] as bool;
      });
      await tester.pumpApp(
        SingleChildScrollView(
          child: WorkspaceActivitySection(
            workspaceId: 'workspace',
            workspaceName: 'Team',
            repository: repository,
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(
        tester.widget<SwitchListTile>(find.byType(SwitchListTile)).value,
        isFalse,
      );
      await tester.tap(find.byType(Switch));
      await tester.pumpAndSettle();
      expect(
        find.textContaining(
          'Personal activity and activity in other workspaces stay private',
        ),
        findsOneWidget,
      );
      verifyNever(() => repository.setSharing('workspace', sharing: true));
      await tester.tap(find.text('Cancel'));
      await tester.pumpAndSettle();
      expect(shared, isFalse);
      await tester.tap(find.byType(Switch));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(FilledButton, 'Share activity'));
      await tester.pumpAndSettle();
      expect(shared, isTrue);
      await tester.tap(find.byType(Switch));
      await tester.pumpAndSettle();
      expect(shared, isFalse);
      expect(tester.takeException(), isNull);
    });
  }
}
