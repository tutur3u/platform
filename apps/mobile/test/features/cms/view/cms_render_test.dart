import 'package:flutter/widgets.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/data/models/cms/cms_models.dart';
import 'package:mobile/data/repositories/cms_repository.dart';
import 'package:mobile/features/cms/view/cms_page.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_mini_nav_cubit.dart';
import 'package:mocktail/mocktail.dart';

import '../../../helpers/design_render_harness.dart';

class _Repository extends Mock implements CmsRepository {
  @override
  Future<CmsSummary> getSummary(String wsId, {bool forceRefresh = false}) =>
      Future.value(
        CmsSummary.fromJson({
          'workspaceId': wsId,
          'counts': const {
            'collections': 3,
            'entries': 42,
            'drafts': 9,
            'scheduled': 4,
            'published': 26,
            'archived': 3,
          },
          'collections': const [
            {
              'id': 'articles',
              'slug': 'articles',
              'title': 'Articles',
              'totalEntries': 24,
              'publishedEntries': 18,
              'isEnabled': true,
            },
            {
              'id': 'events',
              'slug': 'events',
              'title': 'Events',
              'totalEntries': 12,
              'publishedEntries': 6,
              'isEnabled': true,
            },
            {
              'id': 'legacy',
              'slug': 'legacy',
              'title': 'Legacy pages',
              'totalEntries': 6,
              'publishedEntries': 2,
              'isEnabled': false,
            },
          ],
          'queues': const {
            'draftsMissingMedia': [
              {
                'entryId': 'autumn',
                'collectionTitle': 'Articles',
                'title': 'Autumn menu launch',
                'detail': 'Missing cover image',
                'status': 'draft',
              },
            ],
            'scheduledSoon': [
              {
                'entryId': 'offsite',
                'collectionTitle': 'Events',
                'title': 'Team offsite recap',
                'detail': 'Publishes automatically',
                'status': 'scheduled',
                'scheduledFor': '2026-10-28T02:00:00Z',
              },
            ],
            'archivedBacklog': <Object>[],
          },
        }),
      );

  @override
  Future<List<CmsCollection>> listCollections(
    String wsId, {
    bool forceRefresh = false,
  }) => Future.value(const [
    CmsCollection(
      id: 'articles',
      slug: 'articles',
      title: 'Articles',
      collectionType: 'articles',
      description: 'Long-form stories for the website.',
      isEnabled: true,
    ),
    CmsCollection(
      id: 'events',
      slug: 'events',
      title: 'Events',
      collectionType: 'events',
      isEnabled: true,
    ),
    CmsCollection(
      id: 'legacy',
      slug: 'legacy',
      title: 'Legacy pages',
      collectionType: 'pages',
      isEnabled: false,
    ),
  ]);

  @override
  Future<List<CmsEntry>> listEntries(
    String wsId, {
    String? collectionId,
    bool forceRefresh = false,
  }) => Future.value(const [
    CmsEntry(
      id: 'autumn',
      collectionId: 'articles',
      slug: 'autumn-menu-launch',
      title: 'Autumn menu launch',
      status: 'draft',
      summary: 'Seasonal dishes, new hours and the tasting evening.',
    ),
    CmsEntry(
      id: 'offsite',
      collectionId: 'events',
      slug: 'team-offsite-recap',
      title: 'Team offsite recap',
      status: 'scheduled',
      scheduledFor: '2026-10-28T02:00:00Z',
    ),
    CmsEntry(
      id: 'pricing',
      collectionId: 'articles',
      slug: 'pricing-update',
      title: 'Pricing update for studio plans',
      status: 'published',
      summary: 'What changes on 1 November and who it affects.',
    ),
    CmsEntry(
      id: 'old-home',
      collectionId: 'legacy',
      slug: 'old-home',
      title: 'Old home page',
      status: 'archived',
    ),
  ]);
}

/// Redesigned CMS overview and library at every review size and theme.
void main() {
  setUpAll(DesignRender.loadFonts);

  for (final section in ['overview', 'library']) {
    for (final size in DesignRender.sizes.entries) {
      for (final theme in DesignRender.themes.entries) {
        final name = 'cms-$section-${size.key}-${theme.key}';
        testWidgets(name, (tester) async {
          DesignRender.setSize(tester, size.value);
          final actions = ShellChromeActionsCubit();
          final nav = ShellMiniNavCubit();
          addTearDown(actions.close);
          addTearDown(nav.close);
          final (settings, brightness) = theme.value;
          await tester.pumpWidget(
            MultiBlocProvider(
              providers: [
                BlocProvider.value(value: actions),
                BlocProvider.value(value: nav),
              ],
              child: DesignRenderApp(
                settings: settings,
                brightness: brightness,
                child: CmsWorkspace(
                  actorId: 'actor',
                  workspaceId: 'ws',
                  repository: _Repository(),
                ),
              ),
            ),
          );
          await tester.pumpAndSettle();
          if (section == 'library') {
            nav.state
                .resolveForLocation(Routes.cms)!
                .items
                .singleWhere((item) => item.id == 'cms-library')
                .onPressed!();
            await tester.pumpAndSettle();
            expect(
              find.byKey(const ValueKey('collection:articles')),
              findsOneWidget,
            );
            expect(find.text('All collections'), findsOneWidget);
          } else {
            expect(find.text('26 of 42 published'), findsOneWidget);
            expect(find.text('Autumn menu launch'), findsOneWidget);
          }
          expect(tester.takeException(), isNull);
          await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
          await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
          await expectLater(tester, meetsGuideline(textContrastGuideline));
          await DesignRender.capture(tester, name);
        });
      }
    }
  }
}
