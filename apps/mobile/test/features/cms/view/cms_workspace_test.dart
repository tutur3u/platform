import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/data/models/cms/cms_models.dart';
import 'package:mobile/data/repositories/cms_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/cms/view/cms_page.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_mini_nav_cubit.dart';
import 'package:mocktail/mocktail.dart';

import '../../../helpers/pump_app.dart';

class Repository extends Mock implements CmsRepository {
  ApiException? failure;
  List<CmsEntry> entries = [row('Article')];
  Future<List<CmsEntry>> Function(String, String?)? read;
  int saves = 0;
  ApiException? saveFailure;

  @override
  Future<CmsSummary> getSummary(
    String wsId, {
    bool forceRefresh = false,
  }) async {
    if (failure != null) throw failure!;
    return CmsSummary.fromJson({
      'workspaceId': wsId,
      'counts': const <String, dynamic>{},
    });
  }

  @override
  Future<List<CmsCollection>> listCollections(
    String wsId, {
    bool forceRefresh = false,
  }) async {
    if (failure != null) throw failure!;
    return const [
      CmsCollection(
        id: 'collection',
        slug: 'articles',
        title: 'Articles',
        collectionType: 'articles',
        isEnabled: true,
      ),
    ];
  }

  @override
  Future<List<CmsEntry>> listEntries(
    String wsId, {
    String? collectionId,
    bool forceRefresh = false,
  }) async {
    if (failure != null) throw failure!;
    return await (read?.call(wsId, collectionId) ?? Future.value(entries));
  }

  @override
  Future<CmsCollection> createCollection(
    String wsId, {
    required String title,
    required String slug,
    required String collectionType,
    String? description,
  }) async {
    saves++;
    if (saveFailure != null) throw saveFailure!;
    return CmsCollection(
      id: 'saved',
      slug: slug,
      title: title,
      collectionType: collectionType,
      isEnabled: true,
    );
  }
}

CmsEntry row(String name) => CmsEntry(
  id: name,
  collectionId: 'collection',
  slug: name.toLowerCase(),
  title: name,
  status: 'draft',
);

void main() {
  late Repository repository;
  late ShellChromeActionsCubit actions;
  late ShellMiniNavCubit nav;
  setUp(() {
    repository = Repository();
    actions = ShellChromeActionsCubit();
    nav = ShellMiniNavCubit();
  });
  tearDown(() async {
    await actions.close();
    await nav.close();
  });
  Widget page({String actor = 'actor', String workspace = 'ws'}) =>
      MultiBlocProvider(
        providers: [
          BlocProvider.value(value: actions),
          BlocProvider.value(value: nav),
        ],
        child: CmsWorkspace(
          key: ValueKey('$actor:$workspace'),
          actorId: actor,
          workspaceId: workspace,
          repository: repository,
        ),
      );
  ShellActionSpec action(String id) => actions.state
      .resolveForLocation(Routes.cms)
      .singleWhere((item) => item.id == id);
  void library() => nav.state
      .resolveForLocation(Routes.cms)!
      .items
      .singleWhere((item) => item.id == 'cms-library')
      .onPressed!();

  testWidgets('library is lazy and search lives in the shared dock', (
    tester,
  ) async {
    repository.entries = List.generate(500, (i) => row('Article $i'));
    await tester.pumpApp(page());
    await tester.pumpAndSettle();
    library();
    await tester.pumpAndSettle();
    expect(find.byType(AppBar), findsNothing);
    expect(find.text('Article 499'), findsNothing);
    expect(action('cms-search').inDock, isTrue);
    action('cms-search').onPressed!();
    await tester.pumpAndSettle();
    final search = action('cms-search');
    search.searchController!.text = 'Article 499';
    search.onSearchChanged!('Article 499');
    await tester.pumpAndSettle();
    expect(find.text('Article 499'), findsOneWidget);
    expect(find.text('Article 0'), findsNothing);
    search.onCloseSearch!();
    await tester.pumpAndSettle();
    expect(action('cms-search').searchController, isNull);
  });

  testWidgets('late departed workspace response cannot publish', (
    tester,
  ) async {
    final old = Completer<List<CmsEntry>>();
    repository.read = (ws, _) =>
        ws == 'ws' ? old.future : Future.value([row('New')]);
    final scope = ValueNotifier('ws');
    addTearDown(scope.dispose);
    await tester.pumpApp(
      ValueListenableBuilder(
        valueListenable: scope,
        builder: (_, value, _) => page(workspace: value),
      ),
    );
    await tester.pump(const Duration(milliseconds: 1));
    scope.value = 'new';
    await tester.pumpAndSettle();
    library();
    await tester.pumpAndSettle();
    old.complete([row('Private old')]);
    await tester.pumpAndSettle();
    expect(find.text('New'), findsOneWidget);
    expect(find.text('Private old'), findsNothing);
  });

  for (final retained in [true, false]) {
    testWidgets(
      'refresh ${retained ? 'retains challenges' : 'clears denials'}',
      (tester) async {
        await tester.pumpApp(page());
        await tester.pumpAndSettle();
        library();
        await tester.pumpAndSettle();
        repository.failure = ApiException(
          message: 'Denied',
          statusCode: 403,
          code: retained ? 'MFA_REQUIRED' : null,
        );
        action('cms-refresh').onPressed!();
        await tester.pumpAndSettle();
        expect(find.text('Article'), retained ? findsOneWidget : findsNothing);
        if (!retained) {
          expect(
            actions.state
                .resolveForLocation(Routes.cms)
                .where((item) => item.id == 'cms-new-entry'),
            isEmpty,
          );
        }
      },
    );
  }

  testWidgets('failed save retains entered text and permits retry', (
    tester,
  ) async {
    await tester.pumpApp(page());
    await tester.pumpAndSettle();
    repository.saveFailure = const ApiException(
      message: 'Save rejected',
      statusCode: 403,
    );
    action('cms-new-collection').onPressed!();
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField).first, 'Kept draft');
    await tester.tap(find.widgetWithText(FilledButton, 'Save'));
    await tester.pumpAndSettle();
    expect(find.text('Save rejected'), findsOneWidget);
    expect(find.widgetWithText(TextField, 'Kept draft'), findsOneWidget);
    repository.saveFailure = null;
    await tester.tap(find.widgetWithText(FilledButton, 'Save'));
    await tester.pumpAndSettle();
    expect(repository.saves, 2);
    expect(find.widgetWithText(TextField, 'Kept draft'), findsNothing);
  });

  testWidgets('actor departure closes only the owned edit route', (
    tester,
  ) async {
    final actor = ValueNotifier('actor');
    addTearDown(actor.dispose);
    await tester.pumpApp(
      ValueListenableBuilder(
        valueListenable: actor,
        builder: (_, value, _) => page(actor: value),
      ),
    );
    await tester.pumpAndSettle();
    action('cms-new-collection').onPressed!();
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField).first, 'Private draft');
    final navigator = Navigator.of(
      tester.element(find.byType(TextField).first),
    );
    final covered = showDialog<void>(
      context: tester.element(find.byType(TextField).first),
      builder: (_) => const AlertDialog(content: Text('Unrelated modal')),
    );
    await tester.pumpAndSettle();
    actor.value = 'next';
    await tester.pumpAndSettle();
    expect(find.text('Private draft', skipOffstage: false), findsNothing);
    expect(find.text('Unrelated modal'), findsOneWidget);
    navigator.pop();
    await tester.pumpAndSettle();
    await covered;
    expect(repository.saves, 0);
  });
}
