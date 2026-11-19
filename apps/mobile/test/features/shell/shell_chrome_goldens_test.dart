@Tags(['golden'])
library;

import 'dart:io';

import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/theme/sorbet/sorbet_preferences.dart';
import 'package:mobile/core/ui/overlays/app_sheet_scaffold.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/features/settings/view/settings_route_frame.dart';
import 'package:mobile/features/shell/view/mobile_section_app_bar.dart';
import 'package:mobile/features/shell/view/shell_chrome_style.dart';
import 'package:mobile/features/shell/view/shell_dock_overflow.dart';
import 'package:mobile/features/shell/view/shell_workspace_picker.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/features/workspace/workspace_presentation.dart';
import 'package:mocktail/mocktail.dart';

import '../../helpers/design_render_harness.dart';
import '../../helpers/golden_tolerance.dart';
import '../../helpers/pump_app.dart';
import 'shell_chrome_scenes.dart';
import 'view/shell_rail_harness.dart';

class _Workspaces extends MockCubit<WorkspaceState> implements WorkspaceCubit {}

const _demoTeam = Workspace(
  id: 'demo-team',
  name: 'Demo Team',
  tier: workspaceTierPro,
);
const _pickerState = WorkspaceState(
  status: WorkspaceStatus.loaded,
  currentWorkspace: _demoTeam,
  workspaces: [
    Workspace(id: rootWorkspaceId, name: 'Demo Platform'),
    Workspace(id: 'demo-personal', name: 'Alex Doe', personal: true),
    _demoTeam,
    Workspace(id: 'demo-studio', name: 'Demo Studio'),
  ],
);

/// Shell chrome at phone and tablet sizes, light and dark, classic and
/// Sorbet: the top bar, the dock at rest and with Back, notifications and the
/// workspace switcher.
void main() {
  final original = goldenFileComparator;
  setUpAll(() async {
    await DesignRender.loadFonts(forGoldens: true);
    goldenFileComparator = GoldenTolerance(
      File('test/features/shell/shell_chrome_goldens_test.dart').absolute.uri,
    );
  });
  tearDownAll(() => goldenFileComparator = original);

  testWidgets('rail detail leads with Back and has no bottom navbar', (
    tester,
  ) async {
    useShellWindow(tester, const Size(1180, 820));
    mockShellBackChannel();
    await pumpRailShell(
      tester,
      Routes.inventoryProductDetailPath('fixture-product'),
      page: (_) => const Center(child: Text('Inventory product details')),
    );
    expect(railItem(shellL10n(tester).navBack), findsOneWidget);
    expect(
      find.byKey(const ValueKey('persistent-shell-dock-material')),
      findsNothing,
    );
    await expectLater(
      find.byKey(railRenderKey),
      matchesGoldenFile('goldens/rail_detail_classic_light_tablet.png'),
    );
  });

  for (final (design, sorbet) in [
    ('classic', null),
    ('sorbet', const SorbetTheme()),
  ]) {
    for (final brightness in Brightness.values) {
      final variant = '${design}_${brightness.name}_phone';
      testWidgets('settings_back_only_$variant', (tester) async {
        _usePhone(tester);
        await tester.pumpWidget(
          sorbetTestApp(
            sorbet: sorbet,
            brightness: brightness,
            boundaryKey: const ValueKey('golden'),
            home: SettingsRouteFrame(
              title: 'Settings',
              onBack: () {},
              child: const Center(child: Text('Settings content')),
            ),
          ),
        );
        await tester.pumpAndSettle();
        expect(
          find.byKey(const ValueKey('persistent-shell-dock-material')),
          findsNothing,
        );
        await expectLater(
          find.byKey(const ValueKey('golden')),
          matchesGoldenFile('goldens/settings_back_only_$variant.png'),
        );
      });

      testWidgets('workspace_picker_$variant', (tester) async {
        _usePhone(tester);
        final workspaces = _Workspaces();
        when(() => workspaces.hasAuthenticatedActor).thenReturn(false);
        whenListen(
          workspaces,
          const Stream<WorkspaceState>.empty(),
          initialState: _pickerState,
        );
        await tester.pumpWidget(
          sorbetTestApp(
            sorbet: sorbet,
            brightness: brightness,
            boundaryKey: const ValueKey('golden'),
            home: BlocProvider<WorkspaceCubit>.value(
              value: workspaces,
              child: Builder(
                builder: (context) => Material(
                  color: ShellChromeStyle.of(context).page,
                  child: const SafeArea(
                    bottom: false,
                    child: Align(
                      alignment: Alignment.topCenter,
                      child: MobileSectionAppBar(
                        title: 'Home',
                        actions: [ShellWorkspacePicker()],
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        );
        await tester.tap(find.byType(ShellWorkspacePicker));
        await tester.pumpAndSettle();
        expect(find.byType(AppSheetScaffold), findsOneWidget);
        await expectLater(
          find.byKey(const ValueKey('golden')),
          matchesGoldenFile('goldens/workspace_picker_$variant.png'),
        );
      });
    }
  }

  for (final scene in ShellChromeScene.values) {
    for (final (design, sorbet) in [
      ('classic', null),
      ('sorbet', const SorbetTheme()),
    ]) {
      for (final brightness in Brightness.values) {
        for (final (device, size, top, bottom) in [
          if (scene.coversNarrowDock)
            ('narrow_phone', const Size(320, 720), 24.0, 16.0),
          ('phone', const Size(390, 844), 48.0, 34.0),
          ('tablet', const Size(834, 1194), 24.0, 20.0),
        ]) {
          final name = '${scene.name}_${design}_${brightness.name}_$device';
          testWidgets(name, (tester) async {
            tester.view
              ..physicalSize = size
              ..devicePixelRatio = 1
              ..padding = FakeViewPadding(top: top, bottom: bottom)
              ..viewPadding = FakeViewPadding(top: top, bottom: bottom);
            addTearDown(tester.view.reset);
            await tester.pumpWidget(
              sorbetTestApp(
                sorbet: sorbet,
                brightness: brightness,
                boundaryKey: const ValueKey('golden'),
                home: ShellChromeSceneView(scene),
              ),
            );
            await tester.pumpAndSettle();
            TestGesture? hold;
            switch (scene) {
              case ShellChromeScene.overflowSheet:
                await tester.tap(find.byKey(shellDockMoreKey));
                await tester.pumpAndSettle();
                expect(find.byType(BottomSheet), findsOneWidget);
              case ShellChromeScene.dockFocused:
                final home = find.byKey(const ValueKey('home'));
                final glyph = find.descendant(
                  of: home,
                  matching: find.byType(Icon),
                );
                bool isFocused() =>
                    Focus.of(tester.element(glyph)).hasPrimaryFocus;
                for (var attempt = 0; attempt < 8 && !isFocused(); attempt++) {
                  await tester.sendKeyEvent(LogicalKeyboardKey.tab);
                  await tester.pumpAndSettle();
                }
                expect(isFocused(), isTrue);
              case ShellChromeScene.dockPressed:
                hold = await tester.startGesture(
                  tester.getCenter(find.byKey(const ValueKey('home'))),
                );
                await tester.pump(const Duration(milliseconds: 120));
              case ShellChromeScene.topBar ||
                  ShellChromeScene.dockRest ||
                  ShellChromeScene.dockBack ||
                  ShellChromeScene.overflow ||
                  ShellChromeScene.notifications ||
                  ShellChromeScene.switcher:
                break;
            }
            await expectLater(
              find.byKey(const ValueKey('golden')),
              matchesGoldenFile('goldens/$name.png'),
            );
            if (hold != null) {
              await hold.cancel();
              await tester.pumpAndSettle();
            }
            expect(tester.takeException(), isNull);
          });
        }
      }
    }
  }
}

void _usePhone(WidgetTester tester) {
  tester.view
    ..physicalSize = const Size(390, 844)
    ..devicePixelRatio = 1
    ..padding = const FakeViewPadding(top: 48, bottom: 34)
    ..viewPadding = const FakeViewPadding(top: 48, bottom: 34);
  addTearDown(tester.view.reset);
  mockShellBackChannel();
}
