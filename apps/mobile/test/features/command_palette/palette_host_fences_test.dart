import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/command_palette/palette_shortcut_help.dart';
import 'package:mobile/features/command_palette/palette_view.dart';
import 'package:mobile/features/security/cubit/app_lock_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';

import 'palette_host_harness.dart';

const _size = Size(1200, 800);

Future<PaletteHarness> _pump(
  WidgetTester tester, {
  String? initialLocation,
  AuthState? auth,
  WorkspaceState? workspace,
  AppLockState? lock,
  WidgetBuilder? home,
}) => pumpPaletteApp(
  tester,
  platform: TargetPlatform.linux,
  size: _size,
  initialLocation: initialLocation,
  auth: auth,
  workspace: workspace,
  lock: lock,
  home: home,
);

Future<void> _openPalette(WidgetTester tester) => paletteChord(
  tester,
  LogicalKeyboardKey.controlLeft,
  LogicalKeyboardKey.keyK,
);

void main() {
  group('an open palette closes when its scope ends', () {
    testWidgets('on sign-out, and stays unavailable until sign-in', (
      tester,
    ) async {
      final harness = await _pump(tester);
      await _openPalette(tester);
      expect(find.byType(CommandPaletteView), findsOneWidget);

      harness.emitAuth(const AuthState.unauthenticated());
      await tester.pumpAndSettle();
      expect(find.byType(CommandPaletteView), findsNothing);

      await _openPalette(tester);
      expect(find.byType(CommandPaletteView), findsNothing);

      harness.emitAuth(AuthState.authenticated(paletteUser('actor')));
      await tester.pumpAndSettle();
      await _openPalette(tester);
      expect(find.byType(CommandPaletteView), findsOneWidget);
    });

    testWidgets('when another account becomes current', (tester) async {
      final harness = await _pump(tester);
      await _openPalette(tester);
      expect(find.byType(CommandPaletteView), findsOneWidget);

      harness.emitAuth(AuthState.authenticated(paletteUser('someone-else')));
      await tester.pumpAndSettle();
      expect(find.byType(CommandPaletteView), findsNothing);
    });

    testWidgets('on a workspace switch', (tester) async {
      final harness = await _pump(tester);
      await _openPalette(tester);
      expect(find.byType(CommandPaletteView), findsOneWidget);

      harness.emitWorkspace(
        const WorkspaceState(currentWorkspace: Workspace(id: 'other')),
      );
      await tester.pumpAndSettle();
      expect(find.byType(CommandPaletteView), findsNothing);
    });

    testWidgets('when the app locks, and stays unavailable while locked', (
      tester,
    ) async {
      final harness = await _pump(tester);
      await _openPalette(tester);
      expect(find.byType(CommandPaletteView), findsOneWidget);

      harness.emitLock(const AppLockState(hasLoaded: true, locked: true));
      await tester.pumpAndSettle();
      expect(find.byType(CommandPaletteView), findsNothing);

      await _openPalette(tester);
      expect(find.byType(CommandPaletteView), findsNothing);
    });

    testWidgets('the help overlay closes with the session too', (tester) async {
      final harness = await _pump(tester);
      await paletteChord(
        tester,
        LogicalKeyboardKey.controlLeft,
        LogicalKeyboardKey.slash,
      );
      expect(find.byType(PaletteShortcutHelp), findsOneWidget);

      harness.emitAuth(const AuthState.unauthenticated());
      await tester.pumpAndSettle();
      expect(find.byType(PaletteShortcutHelp), findsNothing);
    });
  });

  group('shortcuts are unavailable outside an authorized scope', () {
    for (final (name, auth, workspace, lock) in [
      ('while unauthenticated', const AuthState.unauthenticated(), null, null),
      ('without a current workspace', null, const WorkspaceState(), null),
      ('before the app lock has loaded', null, null, const AppLockState()),
      (
        'while the app is locked',
        null,
        null,
        const AppLockState(hasLoaded: true, locked: true),
      ),
    ]) {
      testWidgets(name, (tester) async {
        final harness = await _pump(
          tester,
          auth: auth,
          workspace: workspace,
          lock: lock,
        );

        await _openPalette(tester);
        expect(find.byType(CommandPaletteView), findsNothing);
        await paletteChord(
          tester,
          LogicalKeyboardKey.controlLeft,
          LogicalKeyboardKey.digit2,
        );
        expect(harness.path, Routes.home);
        await paletteChord(
          tester,
          LogicalKeyboardKey.controlLeft,
          LogicalKeyboardKey.comma,
        );
        expect(harness.path, Routes.home);
      });
    }

    for (final route in [
      Routes.workspaceSelect,
      Routes.onboarding,
      Routes.telemetryConsent,
      Routes.login,
    ]) {
      testWidgets('on $route', (tester) async {
        final harness = await _pump(tester, initialLocation: route);

        await _openPalette(tester);
        expect(find.byType(CommandPaletteView), findsNothing);
        await paletteChord(
          tester,
          LogicalKeyboardKey.controlLeft,
          LogicalKeyboardKey.digit2,
        );
        expect(harness.path, route);
      });
    }
  });

  group('shortcuts yield to an owner of the screen', () {
    testWidgets('a popup route such as a dialog', (tester) async {
      final harness = await _pump(
        tester,
        home: (context) => Scaffold(
          body: TextButton(
            autofocus: true,
            onPressed: () => showDialog<void>(
              context: context,
              builder: (_) =>
                  const AlertDialog(content: TextField(autofocus: true)),
            ),
            child: const Text('Open dialog'),
          ),
        ),
      );
      await tester.tap(find.text('Open dialog'));
      await tester.pumpAndSettle();
      expect(find.byType(AlertDialog), findsOneWidget);

      await _openPalette(tester);
      expect(find.byType(CommandPaletteView), findsNothing);
      await paletteChord(
        tester,
        LogicalKeyboardKey.controlLeft,
        LogicalKeyboardKey.digit2,
      );
      expect(harness.path, Routes.home);
      expect(find.byType(AlertDialog), findsOneWidget);
    });

    testWidgets('a registered modal owner', (tester) async {
      final harness = await _pump(tester);
      harness.chrome.register(
        registrationId: 'sheet',
        ownerId: 'sheet-owner',
        locations: const {Routes.home},
        actions: const [],
        modal: true,
      );
      await tester.pumpAndSettle();
      expect(harness.chrome.state.topmostModalOwner, 'sheet-owner');

      await _openPalette(tester);
      expect(find.byType(CommandPaletteView), findsNothing);
      await paletteChord(
        tester,
        LogicalKeyboardKey.controlLeft,
        LogicalKeyboardKey.digit2,
      );
      expect(harness.path, Routes.home);

      harness.chrome.dismissOwner('sheet-owner');
      await tester.pumpAndSettle();
      await _openPalette(tester);
      expect(find.byType(CommandPaletteView), findsOneWidget);
    });
  });
}
