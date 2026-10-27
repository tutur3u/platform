import 'dart:async';

import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/dashboard/view/home_workspace_chip_rules.dart';
import 'package:mobile/features/dashboard/view/home_workspace_chips.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/features/workspace/data/workspace_pins_repository.dart';
import 'package:mocktail/mocktail.dart';
import 'package:supabase_flutter/supabase_flutter.dart' as supa;

import '../../../helpers/helpers.dart';

class _MockWorkspaceCubit extends MockCubit<WorkspaceState>
    implements WorkspaceCubit {}

class _MockAuthCubit extends MockCubit<AuthState> implements AuthCubit {}

class _Pins extends WorkspacePinsRepository {
  _Pins([this.stored = const []]);

  List<String> stored;
  final List<List<String>> saves = [];
  bool failSave = false;

  /// Fails only the saves of lists it matches.
  bool Function(List<String> workspaceIds)? failFor;

  /// While set, saves wait for it, like a save held by a security check.
  Completer<void>? gate;
  int inFlight = 0;
  int maxInFlight = 0;

  /// Loads that fail before one succeeds.
  int failLoads = 0;
  int loads = 0;

  @override
  Future<List<String>> load() async {
    loads++;
    if (failLoads > 0) {
      failLoads--;
      throw Exception('offline');
    }
    return stored;
  }

  @override
  Future<void> save(List<String> workspaceIds) async {
    saves.add(workspaceIds);
    inFlight++;
    if (inFlight > maxInFlight) maxInFlight = inFlight;
    try {
      await gate?.future;
      if (failSave || (failFor?.call(workspaceIds) ?? false)) {
        throw Exception('offline');
      }
      stored = workspaceIds;
    } finally {
      inFlight--;
    }
  }
}

List<Workspace> _workspaces(int count) => [
  for (var i = 0; i < count; i++)
    Workspace(id: 'ws-$i', name: 'Workspace $i', personal: i == 0),
];

void main() {
  setUpAll(() => registerFallbackValue(const Workspace(id: 'fallback')));

  group('homeChipWorkspaces', () {
    test('shows every workspace when there are fewer than five', () {
      final all = _workspaces(4);
      expect(
        homeChipWorkspaces(workspaces: all, currentId: 'ws-2', pinnedIds: []),
        all,
      );
    });

    test('from five on, shows pins in order led by an unpinned current', () {
      final all = _workspaces(6);
      final chips = homeChipWorkspaces(
        workspaces: all,
        currentId: 'ws-5',
        pinnedIds: const ['ws-3', 'gone', 'ws-1'],
      );
      expect(chips.map((w) => w.id), ['ws-5', 'ws-3', 'ws-1']);
    });

    test('a pinned current workspace keeps its pin position', () {
      final chips = homeChipWorkspaces(
        workspaces: _workspaces(5),
        currentId: 'ws-1',
        pinnedIds: const ['ws-3', 'ws-1'],
      );
      expect(chips.map((w) => w.id), ['ws-3', 'ws-1']);
    });
  });

  test('stored pins decode defensively', () {
    expect(WorkspacePinsRepository.decode('["a","b","a"]'), ['a', 'b']);
    expect(WorkspacePinsRepository.decode('not json'), isEmpty);
    expect(WorkspacePinsRepository.decode('{"a":1}'), isEmpty);
    expect(WorkspacePinsRepository.decode(null), isEmpty);
  });

  group('HomeWorkspaceChips', () {
    late _MockWorkspaceCubit workspaces;
    late _MockAuthCubit auth;

    setUp(() {
      workspaces = _MockWorkspaceCubit();
      auth = _MockAuthCubit();
      whenListen(
        auth,
        const Stream<AuthState>.empty(),
        initialState: AuthState.authenticated(
          supa.User.fromJson({
            'id': 'user-1',
            'aud': 'authenticated',
            'role': 'authenticated',
            'app_metadata': const <String, dynamic>{},
            'user_metadata': const <String, dynamic>{},
            'created_at': '2024-01-01T00:00:00.000000Z',
          })!,
        ),
      );
      when(() => workspaces.selectWorkspace(any())).thenAnswer((_) async {});
    });

    Future<void> pump(
      WidgetTester tester,
      List<Workspace> all,
      _Pins pins, {
      String current = 'ws-0',
    }) async {
      whenListen(
        workspaces,
        const Stream<WorkspaceState>.empty(),
        initialState: WorkspaceState(
          status: WorkspaceStatus.loaded,
          workspaces: all,
          currentWorkspace: all.firstWhere((w) => w.id == current),
        ),
      );
      await tester.pumpApp(
        MultiBlocProvider(
          providers: [
            BlocProvider<WorkspaceCubit>.value(value: workspaces),
            BlocProvider<AuthCubit>.value(value: auth),
          ],
          child: Scaffold(
            body: Padding(
              padding: const EdgeInsets.all(16),
              child: HomeWorkspaceChips(pinsRepository: pins),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
    }

    Finder chip(String id) => find.byKey(ValueKey('home-workspace-chip-$id'));

    testWidgets('few workspaces: every chip, and tapping one switches', (
      tester,
    ) async {
      await pump(tester, _workspaces(3), _Pins());

      for (final id in ['ws-0', 'ws-1', 'ws-2', 'more']) {
        expect(chip(id), findsOneWidget, reason: id);
        expect(tester.getSize(chip(id)).height, greaterThanOrEqualTo(48));
      }
      await tester.tap(chip('ws-2'));
      await tester.pumpAndSettle();
      verify(
        () => workspaces.selectWorkspace(
          any(that: isA<Workspace>().having((w) => w.id, 'id', 'ws-2')),
        ),
      ).called(1);

      // More holds only the commands; Edit pins needs five workspaces.
      await tester.tap(chip('more'));
      await tester.pumpAndSettle();
      expect(find.text('Find workspace'), findsOneWidget);
      expect(find.text('New workspace'), findsOneWidget);
      expect(find.text('Edit pinned workspaces'), findsNothing);
    });

    testWidgets('many workspaces: pinned chips, the rest under More', (
      tester,
    ) async {
      await pump(tester, _workspaces(6), _Pins(['ws-3', 'ws-4']));

      expect(chip('ws-0'), findsOneWidget);
      expect(chip('ws-3'), findsOneWidget);
      expect(chip('ws-4'), findsOneWidget);
      expect(chip('ws-1'), findsNothing);

      await tester.tap(chip('more'));
      await tester.pumpAndSettle();
      expect(find.text('Edit pinned workspaces'), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('home-workspace-more-ws-5')));
      await tester.pumpAndSettle();
      verify(
        () => workspaces.selectWorkspace(
          any(that: isA<Workspace>().having((w) => w.id, 'id', 'ws-5')),
        ),
      ).called(1);
    });

    testWidgets('long press pins a workspace for this user', (tester) async {
      final pins = _Pins(['ws-3']);
      await pump(tester, _workspaces(6), pins);

      await tester.longPress(chip('ws-0'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Pin to Home'));
      await tester.pumpAndSettle();

      expect(pins.saves.single, ['ws-3', 'ws-0']);
    });

    testWidgets('a failed pin save rolls back and says so', (tester) async {
      final pins = _Pins(['ws-3'])..failSave = true;
      await pump(tester, _workspaces(6), pins, current: 'ws-3');

      await tester.longPress(chip('ws-3'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Unpin from Home'));
      await tester.pumpAndSettle();

      expect(pins.saves.single, isEmpty);
      expect(find.text("Couldn't save pinned workspaces."), findsOneWidget);
      // ws-3 is still current and pinned, so its chip remains.
      expect(chip('ws-3'), findsOneWidget);
      await tester.pump(const Duration(seconds: 5));
      await tester.pumpAndSettle();
    });

    testWidgets('a failed pins load retries with backoff', (tester) async {
      final pins = _Pins(['ws-3', 'ws-4'])..failLoads = 1;
      await pump(tester, _workspaces(6), pins);

      // Until the retry lands, only the current workspace has a chip.
      expect(chip('ws-3'), findsNothing);
      await tester.pump(const Duration(seconds: 2));
      await tester.pumpAndSettle();
      expect(pins.loads, 2);
      expect(chip('ws-3'), findsOneWidget);
      expect(chip('ws-4'), findsOneWidget);
    });

    testWidgets('the pins editor follows a rolled-back save', (tester) async {
      final pins = _Pins(['ws-3'])..failSave = true;
      await pump(tester, _workspaces(6), pins);

      await tester.tap(chip('more'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Edit pinned workspaces'));
      await tester.pumpAndSettle();
      final row = find.byKey(const ValueKey('home-workspace-pin-ws-5'));
      await tester.tap(row);
      await tester.pumpAndSettle();

      expect(pins.saves.single, ['ws-3', 'ws-5']);
      final checkbox = tester.widget<AppCheckboxRow>(row);
      expect(checkbox.value, isFalse);
      await tester.pump(const Duration(seconds: 5));
      await tester.pumpAndSettle();
    });

    Future<void> openPinsEditor(WidgetTester tester) async {
      await tester.tap(chip('more'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Edit pinned workspaces'));
      await tester.pumpAndSettle();
    }

    Finder pinRow(String id) => find.byKey(ValueKey('home-workspace-pin-$id'));

    testWidgets('rapid edits save one at a time and only the latest list', (
      tester,
    ) async {
      final pins = _Pins(['ws-3'])..gate = Completer<void>();
      await pump(tester, _workspaces(6), pins);
      await openPinsEditor(tester);

      // The first save is held, as by a security check; two more taps land
      // meanwhile.
      await tester.tap(pinRow('ws-5'));
      await tester.pump();
      await tester.tap(pinRow('ws-1'));
      await tester.pump();
      await tester.tap(pinRow('ws-2'));
      await tester.pump();
      expect(pins.saves, [
        ['ws-3', 'ws-5'],
      ]);

      pins.gate!.complete();
      await tester.pumpAndSettle();

      // The middle edit is superseded, so it never reaches the server.
      expect(pins.saves, [
        ['ws-3', 'ws-5'],
        ['ws-3', 'ws-5', 'ws-1', 'ws-2'],
      ]);
      expect(pins.maxInFlight, 1);
      expect(pins.stored, ['ws-3', 'ws-5', 'ws-1', 'ws-2']);
      expect(find.text("Couldn't save pinned workspaces."), findsNothing);
      for (final id in ['ws-3', 'ws-5', 'ws-1', 'ws-2']) {
        expect(tester.widget<AppCheckboxRow>(pinRow(id)).value, isTrue);
      }
    });

    testWidgets('a superseded failed save stays quiet and the latest wins', (
      tester,
    ) async {
      final pins = _Pins(['ws-3'])
        ..gate = Completer<void>()
        ..failFor = (ids) => ids.length == 2;
      await pump(tester, _workspaces(6), pins);
      await openPinsEditor(tester);

      await tester.tap(pinRow('ws-5'));
      await tester.pump();
      await tester.tap(pinRow('ws-1'));
      await tester.pump();
      pins.gate!.complete();
      await tester.pumpAndSettle();

      expect(pins.saves, [
        ['ws-3', 'ws-5'],
        ['ws-3', 'ws-5', 'ws-1'],
      ]);
      expect(pins.stored, ['ws-3', 'ws-5', 'ws-1']);
      expect(find.text("Couldn't save pinned workspaces."), findsNothing);
      expect(tester.widget<AppCheckboxRow>(pinRow('ws-1')).value, isTrue);
    });

    testWidgets('when the latest save fails, pins roll back to the server', (
      tester,
    ) async {
      final pins = _Pins(['ws-3'])
        ..gate = Completer<void>()
        ..failFor = (ids) => ids.length == 3;
      await pump(tester, _workspaces(6), pins);
      await openPinsEditor(tester);

      await tester.tap(pinRow('ws-5'));
      await tester.pump();
      await tester.tap(pinRow('ws-1'));
      await tester.pump();
      pins.gate!.complete();
      await tester.pumpAndSettle();

      // The first save landed, so the rollback keeps it.
      expect(pins.stored, ['ws-3', 'ws-5']);
      expect(find.text("Couldn't save pinned workspaces."), findsOneWidget);
      expect(tester.widget<AppCheckboxRow>(pinRow('ws-5')).value, isTrue);
      expect(tester.widget<AppCheckboxRow>(pinRow('ws-1')).value, isFalse);
      await tester.pump(const Duration(seconds: 5));
      await tester.pumpAndSettle();
    });

    testWidgets('when every save fails, pins roll back to the stored list', (
      tester,
    ) async {
      final pins = _Pins(['ws-3'])
        ..gate = Completer<void>()
        ..failFor = (_) => true;
      await pump(tester, _workspaces(6), pins);
      await openPinsEditor(tester);

      await tester.tap(pinRow('ws-5'));
      await tester.pump();
      await tester.tap(pinRow('ws-1'));
      await tester.pump();
      pins.gate!.complete();
      await tester.pumpAndSettle();

      // Neither edit was saved, so ws-5 is not restored either.
      expect(pins.stored, ['ws-3']);
      expect(find.text("Couldn't save pinned workspaces."), findsOneWidget);
      expect(tester.widget<AppCheckboxRow>(pinRow('ws-3')).value, isTrue);
      expect(tester.widget<AppCheckboxRow>(pinRow('ws-5')).value, isFalse);
      expect(tester.widget<AppCheckboxRow>(pinRow('ws-1')).value, isFalse);
      await tester.pump(const Duration(seconds: 5));
      await tester.pumpAndSettle();
    });

    testWidgets('a queued edit is still saved after Home unmounts', (
      tester,
    ) async {
      final pins = _Pins(['ws-3'])..gate = Completer<void>();
      await pump(tester, _workspaces(6), pins);
      await openPinsEditor(tester);

      await tester.tap(pinRow('ws-5'));
      await tester.pump();
      await tester.tap(pinRow('ws-1'));
      await tester.pump();
      // Leaving Home disposes the row while the first save is held.
      await tester.pumpWidget(const SizedBox());
      pins.gate!.complete();
      await tester.pumpAndSettle();

      expect(pins.saves, [
        ['ws-3', 'ws-5'],
        ['ws-3', 'ws-5', 'ws-1'],
      ]);
      expect(pins.stored, ['ws-3', 'ws-5', 'ws-1']);
    });

    testWidgets('a queued edit is dropped once its account signs out', (
      tester,
    ) async {
      final pins = _Pins(['ws-3'])..gate = Completer<void>();
      await pump(tester, _workspaces(6), pins);
      await openPinsEditor(tester);

      await tester.tap(pinRow('ws-5'));
      await tester.pump();
      await tester.tap(pinRow('ws-1'));
      await tester.pump();
      await tester.pumpWidget(const SizedBox());
      when(() => auth.state).thenReturn(const AuthState.unauthenticated());
      pins.gate!.complete();
      await tester.pumpAndSettle();

      expect(pins.saves, [
        ['ws-3', 'ws-5'],
      ]);
    });

    testWidgets('chips scroll instead of clipping at 2x text on 320dp', (
      tester,
    ) async {
      tester.view
        ..physicalSize = const Size(320, 568)
        ..devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      tester.platformDispatcher.textScaleFactorTestValue = 2;
      addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);

      await pump(tester, _workspaces(4), _Pins());

      expect(tester.takeException(), isNull);
      expect(tester.getSize(chip('ws-0')).height, greaterThanOrEqualTo(48));
      await tester.dragUntilVisible(
        chip('more'),
        find.byKey(const ValueKey('home-workspace-chips')),
        const Offset(-120, 0),
      );
      expect(chip('more').hitTestable(), findsOneWidget);
    });
  });
}
