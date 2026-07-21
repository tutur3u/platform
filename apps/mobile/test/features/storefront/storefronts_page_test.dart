import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/storefront/storefront_models.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/storefront_repository.dart';
import 'package:mobile/features/storefront/view/storefronts_page.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mocktail/mocktail.dart';

import '../../helpers/helpers.dart';

class _MockWorkspaceCubit extends MockCubit<WorkspaceState>
    implements WorkspaceCubit {}

class _FakeStorefrontRepository extends StorefrontRepository {
  @override
  Future<({int count, List<Storefront> data})> listStorefronts(
    String wsId, {
    String status = 'all',
    String? query,
  }) async => (
    data: const [
      Storefront(
        id: 'store-1',
        name: 'Summer catalog',
        slug: 'summer-catalog',
        status: 'published',
        visibility: 'public',
        currency: 'VND',
        checkoutMode: 'simulated',
        themePreset: 'minimal',
        layoutStyle: 'grid',
        surfaceStyle: 'solid',
        cornerStyle: 'rounded',
        showInventoryBadges: true,
        analyticsEnabled: true,
        listingsCount: 4,
      ),
    ],
    count: 1,
  );
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('renders storefront management without compact-width overflow', (
    tester,
  ) async {
    await tester.binding.setSurfaceSize(const Size(320, 720));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    const workspace = Workspace(id: 'ws-1', name: 'Shop');
    const state = WorkspaceState(
      status: WorkspaceStatus.loaded,
      workspaces: [workspace],
      currentWorkspace: workspace,
      defaultWorkspace: workspace,
    );
    final workspaceCubit = _MockWorkspaceCubit();
    when(() => workspaceCubit.state).thenReturn(state);
    whenListen(
      workspaceCubit,
      const Stream<WorkspaceState>.empty(),
      initialState: state,
    );

    await tester.pumpApp(
      BlocProvider<WorkspaceCubit>.value(
        value: workspaceCubit,
        child: StorefrontsPage(repository: _FakeStorefrontRepository()),
      ),
    );
    await tester.pumpAndSettle();

    final pageContext = tester.element(find.byType(StorefrontsPage));
    final l10n = AppLocalizations.of(pageContext);

    expect(find.text(l10n.storefrontTitle), findsNothing);
    expect(find.text(l10n.storefrontSubtitle), findsOneWidget);
    expect(find.byType(TextField), findsOneWidget);
    expect(find.byType(ChoiceChip), findsWidgets);

    await tester.drag(find.byType(ListView), const Offset(0, -360));
    await tester.pumpAndSettle();

    expect(find.byType(TextField), findsOneWidget);
    expect(find.byType(ChoiceChip), findsWidgets);
    expect(find.text('Summer catalog'), findsOneWidget);
    expect(find.text(l10n.storefrontListingCount(4)), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
