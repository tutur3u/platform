import 'dart:async';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/interaction/app_haptics.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/router/settings_routes.dart';
import 'package:mobile/core/theme/mobile_shad_theme.dart';
import 'package:mobile/core/utils/supported_timezones.dart';
import 'package:mobile/core/widgets/shadcn_localizations_fallback.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/settings_repository.dart';
import 'package:mobile/data/repositories/workspace_permissions_repository.dart';
import 'package:mobile/data/repositories/workspace_secrets_repository.dart';
import 'package:mobile/features/apps/cubit/app_tab_cubit.dart';
import 'package:mobile/features/apps/registry/app_registry.dart';
import 'package:mobile/features/assistant/cubit/assistant_chrome_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/settings/cubit/calendar_settings_cubit.dart';
import 'package:mobile/features/settings/cubit/finance_preferences_cubit.dart';
import 'package:mobile/features/settings/cubit/locale_cubit.dart';
import 'package:mobile/features/settings/cubit/theme_cubit.dart';
import 'package:mobile/features/settings/cubit/timezone_settings_cubit.dart';
import 'package:mobile/features/settings/view/offline_module_page.dart';
import 'package:mobile/features/settings/view/offline_page.dart';
import 'package:mobile/features/settings/view/settings_page.dart';
import 'package:mobile/features/settings/view/settings_widgets.dart';
import 'package:mobile/features/settings/view/settings_workspace_page.dart';
import 'package:mobile/features/settings/view/settings_workspace_secrets_page.dart';
import 'package:mobile/features/settings/view/timezone_settings_tile.dart';
import 'package:mobile/features/shell/cubit/shell_profile_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_profile_state.dart';
import 'package:mobile/features/shell/cubit/shell_title_override_cubit.dart';
import 'package:mobile/features/shell/view/custom_navigation_bar.dart';
import 'package:mobile/features/shell/view/shell_mini_nav.dart';
import 'package:mobile/features/shell/view/shell_page.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/app_dialog_scaffold.dart';
import 'package:mocktail/mocktail.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart' as supa;

import '../../../helpers/helpers.dart';

part 'settings_compact_harness.dart';
part 'settings_hidden_recovery_checks.dart';
part 'settings_detail_shell_checks.dart';
part 'settings_product_editor_checks.dart';
part 'settings_design_checks.dart';
part 'settings_secrets_shell_checks.dart';

void main() {
  tearDown(() => GoRouter.optionURLReflectsImperativeAPIs = false);
  registerHiddenRecoveryChecks();
  registerSettingsDetailShellChecks();
  registerProductEditorChecks();
  registerSettingsDesignChecks();
  registerSettingsSecretsShellChecks();
  setUpAll(() async {
    SharedPreferences.setMockInitialValues({});
    await supa.Supabase.initialize(
      url: 'https://example.supabase.co',
      publishableKey: 'test-anon-key',
    );
    final materialFont = Platform.environment['SETTINGS_MATERIAL_FONT'];
    if (materialFont != null) {
      await (FontLoader('Roboto')..addFont(
            File(materialFont).readAsBytes().then(ByteData.sublistView),
          ))
          .load();
    }
    for (final font in {
      'NotoSans': 'assets/fonts/NotoSans.ttf',
      'MaterialIcons': 'fonts/MaterialIcons-Regular.otf',
    }.entries) {
      await (FontLoader(font.key)..addFont(rootBundle.load(font.value))).load();
    }
  });
  setUp(() {
    GoRouter.optionURLReflectsImperativeAPIs = true;
    SharedPreferences.setMockInitialValues({});
    AppHaptics.enabled = true;
    PackageInfo.setMockInitialValues(
      appName: 'Tuturuuu',
      packageName: 'com.tuturuuu.mobile',
      version: '1.0.0',
      buildNumber: '1',
      buildSignature: '',
    );
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(
          const MethodChannel('mobile/shell_back'),
          (_) async => null,
        );
  });

  testWidgets(
    'one mounted Settings navigation surface preserves Home and Apps',
    (tester) async {
      _viewport(tester, const Size(390, 844));
      final h = _SettingsHarness();
      addTearDown(() async {
        await tester.pumpWidget(const SizedBox.shrink());
        await tester.pump();
        await h.dispose();
      });
      await h.pump(tester);
      expect(
        AppRegistry.moduleById('settings')!.miniAppNavItems.map((i) => i.route),
        [Routes.settings],
      );
      expect(find.byType(ShellPage), findsOneWidget);
      expect(find.byType(MorphingNavigationBar), findsOneWidget);
      expect(
        find.byKey(const ValueKey('mini-nav-settings-settings_app')),
        findsOneWidget,
      );
      expect(
        find.byKey(const ValueKey('mini-nav-settings-settings_workspace')),
        findsNothing,
      );
      expect(
        find.byKey(const ValueKey('mini-nav-settings-settings_you')),
        findsNothing,
      );
      expect(find.byType(shad.Switch), findsNothing);
      await _tapRow(tester, const ValueKey('settings-workspace-row'));
      expect(h.router.state.matchedLocation, Routes.settingsWorkspace);
      expect(find.byType(SettingsWorkspacePage), findsOneWidget);
      await tester.tap(find.bySemanticsLabel('Back'));
      await _settle(tester);
      expect(h.router.state.matchedLocation, Routes.settings);
      await tester.binding.handlePopRoute();
      await _settle(tester);
      expect(h.router.state.matchedLocation, Routes.apps);
      expect(find.bySemanticsLabel('Home'), findsOneWidget);
      expect(find.bySemanticsLabel('Apps'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );

  for (final sample in [
    ('settings-finance-row', 'finance-amounts-visible', 'Show amounts', true),
    ('settings-haptics-row', 'interaction.haptics.enabled', 'Off', false),
    (
      'settings-task-board-row',
      'disable-default-task-board-navigation',
      'Board picker',
      true,
    ),
  ]) {
    testWidgets(
      '${sample.$1} opens a child and saves only an explicit choice',
      (tester) async {
        _viewport(tester, const Size(390, 844));
        final h = _SettingsHarness();
        addTearDown(() async {
          await tester.pumpWidget(const SizedBox.shrink());
          await tester.pump();
          await h.dispose();
        });
        await h.pump(tester);
        final prefs = await SharedPreferences.getInstance();
        final before = prefs.get(sample.$2);
        await _tapRow(tester, ValueKey(sample.$1));
        expect(prefs.get(sample.$2), before);
        expect(find.text('Cancel'), findsOneWidget);
        await tester.tap(find.text('Cancel'));
        await _settle(tester);
        expect(prefs.get(sample.$2), before);
        await _tapRow(tester, ValueKey(sample.$1));
        // The same value may also appear in the root summary below the sheet.
        await tester.tap(find.text(sample.$3).last);
        await _settle(tester);
        expect(find.text('Cancel'), findsNothing);
        expect(
          prefs.getBool(sample.$2),
          sample.$4,
          reason:
              'Finance=${h.finance.state.showAmounts}, '
              'haptics=${AppHaptics.enabled}; selected ${sample.$3}',
        );
        expect(find.text('Cancel'), findsNothing);
        expect(h.router.state.matchedLocation, Routes.settings);
        expect(tester.takeException(), isNull);
      },
    );
  }

  for (final accountSwitch in [false, true]) {
    testWidgets(
      '${accountSwitch ? 'account' : 'workspace'} switch cancels an editor',
      (tester) async {
        final h = _SettingsHarness();
        addTearDown(() async {
          await tester.pumpWidget(const SizedBox.shrink());
          await tester.pump();
          await h.dispose();
        });
        await h.pump(tester);
        await _tapRow(tester, const ValueKey('settings-finance-row'));
        if (accountSwitch) {
          h.accounts.add(_account('other'));
          h.accounts.add(_account('user'));
        } else {
          h.scopes.add(_workspace('other'));
          h.scopes.add(_workspace('ws'));
        }
        await _settle(tester);
        expect(find.text('Cancel'), findsNothing);
        expect(
          (await SharedPreferences.getInstance()).get(
            'finance-amounts-visible',
          ),
          isNull,
        );
        expect(h.router.state.matchedLocation, Routes.settings);
        expect(tester.takeException(), isNull);
      },
    );
  }

  testWidgets(
    'system Back dismisses a choice without leaving Settings or writing',
    (tester) async {
      final h = _SettingsHarness();
      addTearDown(() async {
        await tester.pumpWidget(const SizedBox.shrink());
        await tester.pump();
        await h.dispose();
      });
      await h.pump(tester);
      await tester.tap(find.text('Theme'));
      await _settle(tester);
      expect(find.text('Light'), findsOneWidget);
      await tester.binding.handlePopRoute();
      await _settle(tester);
      expect(find.text('Light'), findsNothing);
      expect(h.router.state.matchedLocation, Routes.settings);
      expect((await SharedPreferences.getInstance()).get('theme-mode'), isNull);
      await tester.tap(find.text('Language'));
      await _settle(tester);
      await tester.tapAt(const Offset(10, 300));
      await _settle(tester);
      expect(find.text('Cancel'), findsNothing);
      expect((await SharedPreferences.getInstance()).get('locale'), isNull);
    },
  );

  testWidgets(
    'timezone roles gate the child and scope change rejects stale selection',
    (tester) async {
      final h = _SettingsHarness();
      addTearDown(() async {
        await tester.pumpWidget(const SizedBox.shrink());
        await tester.pump();
        await h.dispose();
      });
      await h.pump(tester);
      SettingsTile workspaceTile() => tester.widget<SettingsTile>(
        find.descendant(
          of: find.byWidgetPredicate(
            (w) => w is TimezoneSettingsTile && w.workspace,
          ),
          matching: find.byType(SettingsTile),
        ),
      );
      expect(workspaceTile().onTap, isNull);
      await tester.tap(find.text('Workspace timezone'));
      await _settle(tester);
      expect(find.byType(TextField), findsNothing);
      h.allowed = true;
      h.accounts.add(_account('admin'));
      await _settle(tester);
      expect(workspaceTile().onTap, isNotNull);
      await tester.tap(find.text('Workspace timezone'));
      await _settle(tester);
      expect(find.byType(TextField), findsOneWidget);
      h.allowed = false;
      h.scopes.add(_workspace('other'));
      await _settle(tester);
      expect(find.byType(TextField), findsNothing);
      expect(workspaceTile().onTap, isNull);
      verifyNever(
        () => h.timezone.save(
          any(),
          workspace: any(named: 'workspace'),
          canManageWorkspace: any(named: 'canManageWorkspace'),
        ),
      );
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'timezone loading, unknown, retry and effective summary remain visible',
    (tester) async {
      final h = _SettingsHarness();
      addTearDown(() async {
        await tester.pumpWidget(const SizedBox.shrink());
        await tester.pump();
        await h.dispose();
      });
      await h.pump(tester);
      expect(
        find.text('Effective timezone: Asia/Ho_Chi_Minh'),
        findsNWidgets(2),
      );
      h.zones.add(const TimezoneSettingsState());
      await _settle(tester);
      expect(find.text('Resolving timezone…'), findsNWidgets(2));
      h.zones.add(const TimezoneSettingsState(loading: false, failed: true));
      await _settle(tester);
      expect(find.text('Unknown'), findsNWidgets(2));
      await tester.ensureVisible(find.text('Personal timezone'));
      await _settle(tester);
      await tester.tap(find.text('Personal timezone'));
      await _settle(tester);
      verify(h.timezone.reload).called(1);
      expect(find.byType(TextField), findsNothing);
      expect(tester.takeException(), isNull);
    },
  );

  for (final scale in [1.0, 2.0]) {
    testWidgets(
      'small viewport at scale $scale grows rows and opens child controls',
      (tester) async {
        _viewport(tester, const Size(320, 568));
        final h = _SettingsHarness();
        addTearDown(() async {
          await tester.pumpWidget(const SizedBox.shrink());
          await tester.pump();
          await h.dispose();
        });
        final semantics = tester.ensureSemantics();

        await h.pump(tester, scale: scale);
        await _capture(tester, 'settings-root-small-$scale');
        for (final key in [
          'settings-finance-row',
          'settings-haptics-row',
          'settings-task-board-row',
        ]) {
          await tester.scrollUntilVisible(
            find.byKey(ValueKey(key)),
            120,
            scrollable: find.byType(Scrollable).first,
          );
          final rect = tester.getRect(find.byKey(ValueKey(key)));
          expect(rect.height, greaterThanOrEqualTo(48));
          expect(rect.left, greaterThanOrEqualTo(0));
          expect(rect.right, lessThanOrEqualTo(320));
        }
        expect(find.byType(shad.Switch), findsNothing);
        await _tapRow(tester, const ValueKey('settings-haptics-row'));
        expect(find.text('On').last, findsOneWidget);
        expect(find.text('Off'), findsOneWidget);
        final choices = find.ancestor(
          of: find.text('Off'),
          matching: find.byType(SingleChildScrollView),
        );
        expect(choices, findsOneWidget);
        expect(tester.getSize(choices).height, greaterThanOrEqualTo(48));
        final selected = find.ancestor(
          of: find.text('On').last,
          matching: find.byWidgetPredicate(
            (w) => w is Semantics && w.properties.selected == true,
          ),
        );
        expect(selected, findsOneWidget);
        expect(
          tester.getSemantics(selected).flagsCollection.isSelected,
          ui.Tristate.isTrue,
        );
        await _capture(tester, 'settings-haptics-small-$scale');
        await tester.binding.handlePopRoute();
        await _settle(tester);
        semantics.dispose();
        expect(tester.takeException(), isNull);
      },
    );
  }

  testWidgets(
    'non-sliver Finance editor contains scrolling and dismisses without writes',
    (tester) async {
      _viewport(tester, const Size(320, 568));
      final h = _SettingsHarness();
      addTearDown(() async {
        await tester.pumpWidget(const SizedBox.shrink());
        await tester.pump();
        await h.dispose();
      });
      double dockOpacity() => tester
          .widget<AnimatedOpacity>(
            find.ancestor(
              of: find.byType(MorphingNavigationBar),
              matching: find.byType(AnimatedOpacity),
            ),
          )
          .opacity;

      await h.pump(tester, scale: 2);
      final prefs = await SharedPreferences.getInstance();
      final before = prefs.get('finance-amounts-visible');
      final row = find.byKey(const ValueKey('settings-finance-row'));
      await tester.ensureVisible(row);
      await _settle(tester);
      expect(dockOpacity(), 1);
      await tester.tap(row);
      await _settle(tester);
      expect(find.byType(CustomScrollView), findsNothing);
      final body = find.ancestor(
        of: find.text('Show amounts').last,
        matching: find.byType(SingleChildScrollView),
      );
      expect(body, findsOneWidget);
      expect(find.text('Cancel'), findsOneWidget);
      expect(find.byType(AppDialogScaffold), findsOneWidget);
      final scrollable = find.descendant(
        of: body,
        matching: find.byType(Scrollable),
      );
      final position = tester.state<ScrollableState>(scrollable).position;
      final start = position.pixels;
      expect(position.extentAfter, greaterThan(90));
      final gesture = await tester.startGesture(tester.getCenter(body));
      await gesture.moveBy(const Offset(0, -30));
      await tester.pump();
      await gesture.moveBy(const Offset(0, -60));
      await tester.pump();
      expect(position.pixels, greaterThan(start));
      expect(position.outOfRange, isFalse);
      await gesture.up();
      await tester.pump();
      expect(dockOpacity(), 1);
      await _capture(tester, 'settings-finance-scroll-large');
      await tester.binding.handlePopRoute();
      await _settle(tester);
      expect(find.text('Cancel'), findsNothing);
      expect(find.byType(AppDialogScaffold), findsNothing);
      expect(h.router.state.matchedLocation, Routes.settings);
      expect(dockOpacity(), 1);
      expect(prefs.get('finance-amounts-visible'), before);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('timezone choices stay lazy and can find an off-screen zone', (
    tester,
  ) async {
    _viewport(tester, const Size(390, 844));
    final h = _SettingsHarness();
    addTearDown(() async {
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump();
      await h.dispose();
    });
    await h.pump(tester);
    await tester.ensureVisible(find.text('Personal timezone'));
    await _settle(tester);
    await tester.tap(find.text('Personal timezone'));
    await _settle(tester);
    expect(find.byType(ListTile).evaluate().length, lessThan(30));
    expect(
      find.widgetWithText(ListTile, supportedTimezones.last),
      findsNothing,
    );
    await tester.enterText(find.byType(TextField), supportedTimezones.last);
    await _settle(tester);
    expect(
      find.widgetWithText(ListTile, supportedTimezones.last),
      findsOneWidget,
    );
    await tester.binding.handlePopRoute();
    await _settle(tester);
    verifyNever(() => h.timezone.save(any()));
    expect(tester.takeException(), isNull);
  });

  testWidgets('expanded Settings preserves four preference categories', (
    tester,
  ) async {
    _viewport(tester, const Size(1024, 768));
    final h = _SettingsHarness();
    addTearDown(() async {
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump();
      await h.dispose();
    });
    await h.pump(tester);
    final preferences = find.byWidgetPredicate(
      (w) =>
          w is SettingsCompactSection &&
          const {
            'Appearance & language',
            'Calendar & timezone',
            'Notifications & interaction',
            'App preferences',
          }.contains(w.title),
    );
    expect(
      find.descendant(of: preferences, matching: find.byType(SettingsGroup)),
      findsNWidgets(4),
    );
    expect(
      tester.getRect(find.byKey(const ValueKey('settings-haptics-row'))).left,
      greaterThan(tester.getRect(find.text('Theme')).left),
    );
    expect(find.byType(shad.Switch), findsNothing);
    await _capture(tester, 'settings-root-expanded');
    expect(tester.takeException(), isNull);
  });

  testWidgets('timezone search fits with large text and the keyboard', (
    tester,
  ) async {
    _viewport(tester, const Size(320, 568));
    final h = _SettingsHarness();
    addTearDown(() async {
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump();
      await h.dispose();
    });
    double dockOpacity() => tester
        .widget<AnimatedOpacity>(
          find.ancestor(
            of: find.byType(MorphingNavigationBar),
            matching: find.byType(AnimatedOpacity),
          ),
        )
        .opacity;

    await h.pump(tester, scale: 2);
    expect(dockOpacity(), 1);
    await tester.ensureVisible(find.text('Personal timezone'));
    await _settle(tester);
    await tester.tap(find.text('Personal timezone'));
    await _settle(tester);
    tester.view.viewInsets = const FakeViewPadding(bottom: 280);
    addTearDown(tester.view.resetViewInsets);
    await tester.enterText(find.byType(TextField), 'Paris');
    await _settle(tester);
    await tester.scrollUntilVisible(
      find.widgetWithText(ListTile, 'Europe/Paris'),
      60,
      scrollable: find
          .descendant(
            of: find.byType(CustomScrollView),
            matching: find.byType(Scrollable),
          )
          .first,
    );
    await _settle(tester);
    expect(find.byType(MorphingNavigationBar), findsNothing);
    await _capture(tester, 'settings-timezone-keyboard-large');
    await tester.tap(find.widgetWithText(ListTile, 'Europe/Paris'));
    await _settle(tester);
    verify(() => h.timezone.save('Europe/Paris')).called(1);
    expect(h.router.state.matchedLocation, Routes.settings);

    tester.view.resetViewInsets();
    await tester.pump();
    expect(dockOpacity(), 1);
    final rootScroll = find.byType(Scrollable).first;
    final position = tester.state<ScrollableState>(rootScroll).position;
    expect(position.extentAfter, greaterThan(180));
    final gesture = await tester.startGesture(tester.getCenter(rootScroll));
    await gesture.moveBy(const Offset(0, -30));
    await tester.pump();
    await gesture.moveBy(const Offset(0, -150));
    await tester.pump();
    expect(
      tester.state<ScrollableState>(rootScroll).position.pixels,
      greaterThan(0),
    );
    expect(position.outOfRange, isFalse);
    expect(dockOpacity(), 0);
    final downOffset = position.pixels;
    final reverseDistance = (downOffset - position.minScrollExtent) / 2;
    await gesture.moveBy(Offset(0, reverseDistance));
    await tester.pump();
    expect(
      tester.state<ScrollableState>(rootScroll).position.pixels,
      greaterThan(0),
    );
    expect(position.outOfRange, isFalse);
    expect(dockOpacity(), 1);
    await gesture.up();
    await _settle(tester);
    expect(tester.takeException(), isNull);
  });

  testWidgets(
    'legacy Preferences and About deep links retain Settings Back and licenses',
    (tester) async {
      final h = _SettingsHarness(initial: Routes.settingsPreferences);
      addTearDown(() async {
        await tester.pumpWidget(const SizedBox.shrink());
        await tester.pump();
        await h.dispose();
      });
      await h.pump(tester);
      expect(h.router.state.matchedLocation, Routes.settings);
      h.router.go(Routes.settingsAbout);
      await _settle(tester);
      await tester.tap(find.text('Open-source licenses'));
      await _settle(tester);
      expect(find.byType(LicensePage), findsOneWidget);
      await tester.binding.handlePopRoute();
      await _settle(tester);
      expect(find.byType(LicensePage), findsNothing);
      await tester.binding.handlePopRoute();
      await _settle(tester);
      expect(h.router.state.matchedLocation, Routes.settings);
      expect(tester.takeException(), isNull);
    },
  );
}
