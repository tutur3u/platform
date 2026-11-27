import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/crm/crm_group_post.dart';
import 'package:mobile/data/models/crm/crm_models.dart';
import 'package:mobile/data/repositories/crm_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/crm/view/contact_group_posts.dart';
import 'package:mocktail/mocktail.dart';

import '../../../helpers/design_render_harness.dart';

class _Repository extends Mock implements CrmRepository {}

void main() {
  const first = CrmGroupPost(id: 'first', title: 'First post');
  const second = CrmGroupPost(
    id: 'second',
    title: 'Second post',
    content: 'Second post body',
  );
  late _Repository repository;

  setUp(() => repository = _Repository());
  setUpAll(() => registerFallbackValue(() async {}));

  Future<void> pump(
    WidgetTester tester, {
    required bool Function() canEdit,
  }) async {
    DesignRender.setSize(tester, DesignRender.sizes['phone']!);
    final (settings, brightness) = DesignRender.themes['light']!;
    await tester.pumpWidget(
      DesignRenderApp(
        settings: settings,
        brightness: brightness,
        child: ContactGroupPosts(
          workspaceId: 'ws',
          group: const CrmGroup(id: 'group', name: 'Example group'),
          repository: repository,
          canView: () => true,
          canEdit: canEdit,
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  Future<void> openEdit(WidgetTester tester) async {
    await tester.tap(find.text('First post'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Edit'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField).first, 'Revised');
    await tester.pumpAndSettle();
  }

  testWidgets('viewer pages group posts and opens a read-only detail', (
    tester,
  ) async {
    when(
      () => repository.getGroupPostsPage('ws', 'group'),
    ).thenAnswer((_) async => (posts: [first], nextCursor: 'next'));
    when(
      () => repository.getGroupPostsPage('ws', 'group', cursor: 'next'),
    ).thenAnswer((_) async => (posts: [first, second], nextCursor: null));
    await pump(tester, canEdit: () => false);
    await tester.tap(find.text('Load more'));
    await tester.pumpAndSettle();
    expect(find.text('First post'), findsOneWidget);
    expect(find.text('Load more'), findsNothing);
    await tester.tap(find.text('Second post'));
    await tester.pumpAndSettle();
    expect(find.text('Second post body'), findsOneWidget);
    expect(find.text('Edit'), findsNothing);
    expect(find.text('Save'), findsNothing);
  });

  testWidgets('unconfirmed save requires a successful refresh', (tester) async {
    var reads = 0;
    when(() => repository.getGroupPostsPage('ws', 'group')).thenAnswer((
      _,
    ) async {
      reads++;
      if (reads == 2) throw const ApiException.transport(message: 'offline');
      return (posts: [if (reads == 1) first else second], nextCursor: null);
    });
    when(
      () => repository.updateGroupPost('ws', 'group', 'first', {
        'title': 'Revised',
      }, beforeDispatch: any(named: 'beforeDispatch')),
    ).thenAnswer((call) async {
      final guard =
          call.namedArguments[#beforeDispatch] as Future<void> Function();
      await guard();
      throw const ApiException.transport(message: 'disconnected');
    });
    await pump(tester, canEdit: () => true);
    await openEdit(tester);
    await tester.tap(find.text('Save'));
    await tester.pumpAndSettle();
    expect(find.text('Save'), findsNothing);
    expect(find.text('Revised'), findsOneWidget);
    expect(reads, 1);
    await tester.tap(find.text('Refresh'));
    await tester.pumpAndSettle();
    expect(find.text('Save'), findsNothing);
    await tester.tap(find.text('Retry'));
    await tester.pumpAndSettle();
    expect(find.text('Second post'), findsOneWidget);
    expect(reads, 3);
    verify(
      () => repository.updateGroupPost('ws', 'group', 'first', {
        'title': 'Revised',
      }, beforeDispatch: any(named: 'beforeDispatch')),
    ).called(1);
  });

  testWidgets('rechecks edit permission at transport dispatch', (tester) async {
    var allowed = true;
    var dispatched = false;
    when(
      () => repository.getGroupPostsPage('ws', 'group'),
    ).thenAnswer((_) async => (posts: [first], nextCursor: null));
    when(
      () => repository.updateGroupPost('ws', 'group', 'first', {
        'title': 'Revised',
      }, beforeDispatch: any(named: 'beforeDispatch')),
    ).thenAnswer((call) async {
      allowed = false;
      final guard =
          call.namedArguments[#beforeDispatch] as Future<void> Function();
      await guard();
      dispatched = true;
    });
    await pump(tester, canEdit: () => allowed);
    await openEdit(tester);
    await tester.tap(find.text('Save'));
    await tester.pumpAndSettle();
    expect(allowed, isFalse);
    expect(dispatched, isFalse);
  });
}
