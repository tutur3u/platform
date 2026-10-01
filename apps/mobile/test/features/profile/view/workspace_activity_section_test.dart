import 'dart:ui' show Tristate;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/repositories/profile_activity_repository.dart';
import 'package:mobile/features/profile/view/workspace_activity_section.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;
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
        tester.widget<shad.Switch>(find.byType(shad.Switch)).value,
        isFalse,
      );
      await tester.tap(find.text('Share activity'));
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
      await tester.tap(find.text('Share activity'));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(FilledButton, 'Share activity'));
      await tester.pumpAndSettle();
      expect(shared, isTrue);
      await tester.tap(find.text('Share activity'));
      await tester.pumpAndSettle();
      expect(shared, isFalse);
      expect(tester.takeException(), isNull);
    });
  }
  testWidgets('sharing has one named keyboard target and requires consent', (
    tester,
  ) async {
    final repository = _Repository();
    when(() => repository.load('workspace')).thenAnswer(
      (_) async => {
        'sharing': false,
        'members': <Map<String, dynamic>>[],
        'next': null,
      },
    );
    final handle = tester.ensureSemantics();
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
    final detector = tester.widget<FocusableActionDetector>(
      find
          .descendant(
            of: find.byType(shad.Switch),
            matching: find.byType(FocusableActionDetector),
          )
          .first,
    );
    expect(
      Focus.of(tester.element(find.byWidget(detector.child))).canRequestFocus,
      isFalse,
    );
    await tester.sendKeyEvent(LogicalKeyboardKey.tab);
    await tester.pump();
    final node = tester.getSemantics(find.text('Share activity'));
    expect(node.label, contains('Share activity'));
    expect(node.getSemanticsData().flagsCollection.isToggled, Tristate.isFalse);
    await tester.sendKeyEvent(LogicalKeyboardKey.enter);
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
    expect(tester.widget<shad.Switch>(find.byType(shad.Switch)).value, isFalse);
    handle.dispose();
  });
}
