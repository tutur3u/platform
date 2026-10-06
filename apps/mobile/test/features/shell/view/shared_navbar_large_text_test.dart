import 'dart:convert';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/theme/mobile_shad_theme.dart';
import 'package:mobile/core/widgets/shadcn_localizations_fallback.dart';
import 'package:mobile/core/widgets/shadcn_material_bridge.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/settings_repository.dart';
import 'package:mobile/features/apps/cubit/app_tab_cubit.dart';
import 'package:mobile/features/assistant/cubit/assistant_chrome_cubit.dart';
import 'package:mobile/features/assistant/view/assistant_page.dart';
import 'package:mobile/features/assistant/widgets/assistant_composer_launcher.dart';
import 'package:mobile/features/assistant/widgets/assistant_header_status_chip.dart';
import 'package:mobile/features/assistant/widgets/assistant_live_call_controls.dart';
import 'package:mobile/features/assistant/widgets/assistant_live_primary_action.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/settings/cubit/experimental_apps_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_profile_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_profile_state.dart';
import 'package:mobile/features/shell/cubit/shell_title_override_cubit.dart';
import 'package:mobile/features/shell/view/custom_navigation_bar.dart';
import 'package:mobile/features/shell/view/floating_shell_dock.dart';
import 'package:mobile/features/shell/view/shell_dock_surface.dart';
import 'package:mobile/features/shell/view/shell_mini_nav.dart';
import 'package:mobile/features/shell/view/shell_page.dart';
import 'package:mobile/features/shell/view/shell_top_bar_title.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart' as supa;

class _Auth extends MockCubit<AuthState> implements AuthCubit {}

class _Workspaces extends MockCubit<WorkspaceState> implements WorkspaceCubit {}

class _Profile extends MockCubit<ShellProfileState>
    implements ShellProfileCubit {}

Future<void> _pump(WidgetTester tester) async {
  for (var i = 0; i < 12; i++) {
    await tester.pump(const Duration(milliseconds: 50));
  }
}

void main() {
  late AppTabCubit apps;
  late ExperimentalAppsCubit experiments;
  late _Auth auth;
  late _Workspaces workspaces;
  late _Profile profile;
  late GoRouter router;
  late AssistantChromeCubit assistant;
  var textScale = 1.0;
  var width = 320.0;
  var locale = const Locale('en');
  final baseline = Platform.environment['NAVBAR_BASELINE'] == '1';

  setUpAll(() async {
    TestWidgetsFlutterBinding.ensureInitialized();
    SharedPreferences.setMockInitialValues({});
    await supa.Supabase.initialize(
      url: 'https://synthetic.supabase.test',
      publishableKey: 'synthetic-test-key',
      authOptions: const supa.FlutterAuthClientOptions(
        autoRefreshToken: false,
        detectSessionInUri: false,
        localStorage: supa.EmptyLocalStorage(),
      ),
    );
    final font = Platform.environment['NAVBAR_MATERIAL_FONT'];
    if (font != null) {
      final loader = FontLoader('Roboto')
        ..addFont(File(font).readAsBytes().then(ByteData.sublistView));
      await loader.load();
    }
    final manifest =
        jsonDecode(await rootBundle.loadString('FontManifest.json'))
            as List<dynamic>;
    for (final entry in manifest.cast<Map<String, dynamic>>()) {
      final loader = FontLoader(entry['family'] as String);
      for (final font
          in (entry['fonts'] as List<dynamic>).cast<Map<String, dynamic>>()) {
        loader.addFont(rootBundle.load(font['asset'] as String));
      }
      await loader.load();
    }
  });

  tearDownAll(() => supa.Supabase.instance.dispose());

  setUp(() async {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(
          const MethodChannel('mobile/shell_back'),
          (_) async => null,
        );
    SharedPreferences.setMockInitialValues({});
    assistant = AssistantChromeCubit();
    apps = AppTabCubit(settingsRepository: SettingsRepository());
    experiments = ExperimentalAppsCubit(
      settingsRepository: SettingsRepository(),
    );
    await experiments.load();
    auth = _Auth();
    workspaces = _Workspaces();
    profile = _Profile();
    whenListen(
      auth,
      const Stream<AuthState>.empty(),
      initialState: const AuthState.unauthenticated(),
    );
    whenListen(
      workspaces,
      const Stream<WorkspaceState>.empty(),
      initialState: const WorkspaceState(
        currentWorkspace: Workspace(id: 'synthetic-personal', personal: true),
      ),
    );
    whenListen(
      profile,
      const Stream<ShellProfileState>.empty(),
      initialState: const ShellProfileState(),
    );
    router = GoRouter(
      initialLocation: Routes.settings,
      routes: [
        ShellRoute(
          builder: (context, state, child) => ShellPage(
            matchedLocation: state.uri.path,
            enableDebugLogs: false,
            child: child,
          ),
          routes: [
            GoRoute(path: Routes.apps, builder: (_, _) => const SizedBox()),
            GoRoute(
              path: Routes.assistant,
              builder: (_, _) => const SizedBox(),
            ),
            GoRoute(path: Routes.home, builder: (_, _) => const SizedBox()),
            GoRoute(path: Routes.settings, builder: (_, _) => const _Section()),
            GoRoute(
              path: Routes.profileRoot,
              builder: (_, _) => const SizedBox(),
            ),
          ],
        ),
      ],
    );
  });
  tearDown(() async {
    router.dispose();
    await assistant.close();
    await apps.close();
    await experiments.close();
    await auth.close();
    await workspaces.close();
    await profile.close();
  });

  Future<void> mount(WidgetTester tester) async {
    tester.view
      ..devicePixelRatio = 1
      ..physicalSize = Size(width, 568);
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });
    await tester.pumpWidget(
      RepaintBoundary(
        key: const ValueKey('navbar-render'),
        child: MultiBlocProvider(
          providers: [
            BlocProvider.value(value: apps),
            BlocProvider.value(value: experiments),
            BlocProvider<AuthCubit>.value(value: auth),
            BlocProvider<WorkspaceCubit>.value(value: workspaces),
            BlocProvider<ShellProfileCubit>.value(value: profile),
            BlocProvider.value(value: assistant),
            BlocProvider(create: (_) => ShellMiniNavCubit()),
            BlocProvider(create: (_) => ShellTitleOverrideCubit()),
            BlocProvider(create: (_) => ShellChromeActionsCubit()),
          ],
          child: shad.ShadcnApp.router(
            theme: MobileShadTheme.light,
            locale: locale,
            debugShowCheckedModeBanner: false,
            localizationsDelegates: const [
              ...AppLocalizations.localizationsDelegates,
              AppShadcnLocalizationsDelegate(),
            ],
            supportedLocales: AppLocalizations.supportedLocales,
            builder: (context, child) => MediaQuery(
              data: MediaQuery.of(
                context,
              ).copyWith(textScaler: TextScaler.linear(textScale)),
              child: ShadcnMaterialBridge.appBuilder(context, child),
            ),
            routerConfig: router,
          ),
        ),
      ),
    );
    await _pump(tester);
  }

  testWidgets('actual shell retains its dock material from Chat to idle Live', (
    tester,
  ) async {
    width = 320;
    textScale = 3;
    await mount(tester);
    router.go(Routes.assistant);
    assistant.setComposerVisible(visible: true);
    await _pump(tester);
    final surface = find.byKey(
      const ValueKey('persistent-shell-dock-material'),
    );
    expect(surface, findsOneWidget);
    final materialElement = tester.element(surface);
    // Exercise the actual cached AssistantPage publisher and its internal
    // composer state, rather than replacing the shell's registered page slot.
    await tester.tap(find.byType(AssistantComposerFab));
    await _pump(tester);
    expect(find.byType(TextField), findsOneWidget);
    assistant.enterLiveMode();
    // Page slots publish after layout; retain identity during that frame too.
    await tester.pump();
    expect(tester.element(surface), same(materialElement));
    // Page publication runs after layout; render its dock-listener notification
    // too. Both handoff frames must retain the same single material surface.
    await tester.pump();
    expect(surface, findsOneWidget);
    expect(tester.element(surface), same(materialElement));
    expect(find.byType(ShellDockSurface), findsOneWidget);
    for (final frame in [16, 80, 180, 320]) {
      await tester.pump(Duration(milliseconds: frame));
      expect(surface, findsOneWidget);
      expect(tester.element(surface), same(materialElement));
      expect(find.byType(ShellDockSurface), findsOneWidget);
      expect(find.byType(AssistantLiveCallControls), findsNothing);
      expect(find.byType(MorphingNavigationBar), findsOneWidget);
      expect(find.byType(TextField), findsNothing);
      expect(tester.takeException(), isNull);
    }
    // The action rail replaces Chat's action after its outgoing transition.
    expect(find.byType(AssistantLivePrimaryAction), findsOneWidget);
    expect(find.byTooltip('Call Mira'), findsOneWidget);
    assistant.toggleComposerNavigation();
    await _pump(tester);
    expect(tester.element(surface), same(materialElement));
    expect(find.byType(AssistantLiveCallControls), findsNothing);
    assistant.toggleComposerNavigation();
    await _pump(tester);
    expect(tester.element(surface), same(materialElement));
    expect(find.byType(AssistantLiveCallControls), findsNothing);
    expect(find.byTooltip('Call Mira'), findsOneWidget);
    assistant.enterFullscreen();
    await _pump(tester);
    expect(tester.element(surface), same(materialElement));
    expect(find.byType(AssistantLiveCallControls), findsNothing);
    expect(find.byTooltip('Call Mira'), findsOneWidget);
    assistant.exitLiveMode();
    await _pump(tester);
    await tester.tap(find.byType(AssistantComposerFab));
    await _pump(tester);
    expect(tester.element(surface), same(materialElement));
    expect(find.byType(TextField), findsOneWidget);
    expect(find.byType(AssistantLiveCallControls), findsNothing);
  });

  for (final title in ['Settings', 'Profile', 'Mira Chat', 'Mira Live']) {
    final profileSection = title == 'Profile';
    final renderedTitle = profileSection
        ? 'Overview'
        : title.startsWith('Mira')
        ? 'Mira'
        : title;
    final assistantSection = title.startsWith('Mira');
    for (final viewport in [320.0, 393.0]) {
      for (final scale in [1.0, 2.0, 3.0]) {
        testWidgets('$title width$viewport text$scale paints a title prefix '
            'in actual shell navbar', (tester) async {
          width = viewport;
          textScale = scale;
          await mount(tester);
          if (profileSection) {
            router.go(Routes.profileRoot);
            await _pump(tester);
          }
          if (assistantSection) {
            router.go(Routes.assistant);
            await _pump(tester);
            assistant.setLiveMode(value: title == 'Mira Live');
            await _pump(tester);
          }
          final titleFinder = find.descendant(
            of: find.byType(ShellTopBarTitle),
            matching: find.text(renderedTitle),
          );
          expect(titleFinder, findsOneWidget);
          if (assistantSection) {
            expect(
              tester
                  .widget<AssistantPage>(find.byType(AssistantPage))
                  .repository,
              isNull,
              reason:
                  'The default cached root factory remains production-owned',
            );
          }
          final paragraph = tester.renderObject<RenderParagraph>(titleFinder);
          final intrinsicHeight = paragraph.getMaxIntrinsicHeight(
            paragraph.size.width,
          );
          if (baseline && !assistantSection && scale > 1) {
            expect(paragraph.size.height, lessThan(intrinsicHeight));
          } else {
            expect(
              paragraph.size.height,
              greaterThanOrEqualTo(intrinsicHeight),
            );
          }
          expect(paragraph.maxLines, 1);
          final fontSize = (paragraph.text as TextSpan).style!.fontSize!;
          expect(
            paragraph.textScaler.scale(fontSize),
            closeTo(fontSize * scale, .01),
          );
          final bar = tester.getRect(find.byType(shad.AppBar).first);
          final titleRect = tester.getRect(titleFinder);
          expect(bar.contains(titleRect.topLeft), isTrue);
          expect(bar.contains(titleRect.bottomRight), isTrue);
          final glyphInk = await _firstGlyphInk(tester, paragraph, titleRect);
          if (!baseline) {
            expect(
              glyphInk,
              greaterThan(0),
              reason: '$title must paint a real title glyph, not only ellipsis',
            );
          }
          if (scale == 1 || baseline) expect(bar.height, 54);
          Rect? content;
          if (!assistantSection) {
            content = tester.getRect(
              profileSection
                  ? find.byKey(const ValueKey('profile-overview-content'))
                  : find.byKey(const ValueKey('navbar-content')),
            );
            expect(content.top, closeTo(bar.bottom + 10, .01));
          }
          expect(
            floatingShellHeaderInset(
              tester.element(find.byType(ShellTopBarTitle)),
            ),
            bar.height,
          );
          Rect? selectorRect;
          if (profileSection) {
            final selector = find.byKey(const ValueKey('profile-views'));
            expect(selector, findsOneWidget);
            selectorRect = tester.getRect(selector);
            expect(selectorRect.size, const Size(104, 46));
            expect(bar.contains(selectorRect.topLeft), isTrue);
            expect(bar.contains(selectorRect.bottomRight), isTrue);
            expect(
              find.ancestor(of: selector, matching: find.byType(shad.AppBar)),
              findsOneWidget,
            );
          }
          final semantics = tester.ensureSemantics();
          expect(
            find.bySemanticsLabel(
              RegExp(
                assistantSection
                    ? '^${RegExp.escape(renderedTitle)}\$'
                    : '$renderedTitle, Search apps',
              ),
            ),
            findsOneWidget,
          );
          final output = Platform.environment['NAVBAR_RENDER_DIR'];
          if (output != null) {
            await tester.runAsync(() async {
              final directory = Directory(output)..createSync(recursive: true);
              final name =
                  '${baseline ? 'before' : 'after'}-$title-$viewport-$scale';
              final boundary = tester.renderObject<RenderRepaintBoundary>(
                find.byKey(const ValueKey('navbar-render')),
              );
              final image = await boundary.toImage();
              final bytes = await image.toByteData(
                format: ui.ImageByteFormat.png,
              );
              await File(
                '${directory.path}/$name.png',
              ).writeAsBytes(bytes!.buffer.asUint8List());
              await File('${directory.path}/$name.json').writeAsString(
                jsonEncode({
                  'synthetic': true,
                  'scale': scale,
                  'width': width,
                  'bar': [bar.left, bar.top, bar.right, bar.bottom],
                  'title': [paragraph.size.width, paragraph.size.height],
                  'intrinsicTitleHeight': intrinsicHeight,
                  'paragraphBounds': _rectValues(titleRect),
                  'firstTitleGlyphInkPixels': glyphInk,
                  'contentTop': content?.top,
                  'selector': _rectValues(selectorRect),
                }),
              );
              image.dispose();
            });
          }
          if (!baseline && profileSection && viewport == 393 && scale == 2) {
            await tester.tap(find.byTooltip('Timeline'));
            await _pump(tester);
            expect(
              tester
                  .getSemantics(find.byTooltip('Timeline'))
                  .getSemanticsData()
                  .flagsCollection
                  .isSelected,
              ui.Tristate.isTrue,
            );
          }
          semantics.dispose();
          expect(tester.takeException(), isNull);
        });
      }
    }
  }
  for (final language in ['en', 'vi']) {
    for (final scale in [1.0, 2.0, 3.0]) {
      testWidgets(
        'actual 320px navbar $language text$scale: title and recovery',
        (tester) async {
          width = 320;
          textScale = scale;
          locale = Locale(language);
          await mount(tester);
          router.go(Routes.assistant);
          await _pump(tester);
          final context = tester.element(find.byType(ShellTopBarTitle));
          final titles = context.read<ShellTitleOverrideCubit>();
          final status = AppLocalizations.of(context).assistantLocalHeaderIssue;
          var opened = 0;
          final submitted = <String>[];
          titles.register(
            registrationId: 'synthetic-header-test',
            ownerId: 'synthetic-header-test',
            locations: {Routes.assistant},
            title: 'Atlas',
            onTitleSubmitted: (name) async => submitted.add(name),
            titleActionToken: 'synthetic-actor-epoch',
            subtitle: status,
            onSubtitlePressed: () => opened++,
          );
          await _pump(tester);
          final titleFinder = find.descendant(
            of: find.byType(ShellTopBarTitle),
            matching: find.text('Atlas'),
          );
          expect(titleFinder, findsOneWidget);
          final paragraph = tester.renderObject<RenderParagraph>(titleFinder);
          expect(
            await _firstGlyphInk(
              tester,
              paragraph,
              tester.getRect(titleFinder),
            ),
            greaterThan(0),
          );
          final target = find.byKey(
            const ValueKey('assistant-local-header-status'),
          );
          expect(find.byType(AssistantHeaderStatusChip), findsOneWidget);
          expect(tester.getSize(target).height, greaterThanOrEqualTo(48));
          expect(tester.getSize(target).width, greaterThanOrEqualTo(48));
          final rename = find.byKey(const ValueKey('assistant-name-title'));
          expect(tester.getSize(rename).height, greaterThanOrEqualTo(48));
          expect(tester.getSize(rename).width, greaterThanOrEqualTo(48));
          final bar = tester.getRect(find.byType(shad.AppBar).first);
          for (final action in [rename, target]) {
            final rect = tester.getRect(action);
            expect(bar.contains(rect.topLeft), isTrue);
            expect(bar.contains(rect.bottomRight), isTrue);
          }
          expect(
            tester.getRect(rename).overlaps(tester.getRect(target)),
            isFalse,
          );
          await tester.tap(rename);
          await _pump(tester);
          final input = find.byKey(const ValueKey('assistant-name-input'));
          expect(input, findsOneWidget);
          expect(tester.widget<TextField>(input).autofocus, isTrue);
          await tester.enterText(input, 'Nova');
          await tester.testTextInput.receiveAction(TextInputAction.done);
          await _pump(tester);
          expect(submitted, ['Nova']);
          expect(input, findsNothing);
          await tester.tap(target);
          await tester.pump();
          expect(opened, 1);
          expect(tester.takeException(), isNull);
          await tester.pumpWidget(const SizedBox.shrink());
          await tester.pump();
          locale = const Locale('en');
        },
      );
    }
  }
}

/// Synthetic Settings body inside the real shell. Profile cases exercise the
/// real ProfileOverviewPage with scoped mock cubits and no signed-in account.
class _Section extends StatelessWidget {
  const _Section();
  @override
  Widget build(BuildContext context) => ListView(
    padding: const EdgeInsets.only(top: 10, left: 16),
    children: const [
      Text('Synthetic section content', key: ValueKey('navbar-content')),
    ],
  );
}

List<double>? _rectValues(Rect? rect) =>
    rect == null ? null : [rect.left, rect.top, rect.right, rect.bottom];

Future<int> _firstGlyphInk(
  WidgetTester tester,
  RenderParagraph paragraph,
  Rect titleRect,
) async {
  final boxes = paragraph.getBoxesForSelection(
    const TextSelection(baseOffset: 0, extentOffset: 1),
  );
  if (boxes.isEmpty) return 0;
  final box = boxes.first.toRect();
  final origin = paragraph.localToGlobal(Offset.zero);
  final glyph = box.shift(origin).intersect(titleRect);
  return (await tester.runAsync(() async {
    final boundary = tester.renderObject<RenderRepaintBoundary>(
      find.byKey(const ValueKey('navbar-render')),
    );
    final image = await boundary.toImage();
    try {
      final bytes = await image.toByteData();
      var pixels = 0;
      final region = glyph.intersect(
        Rect.fromLTWH(0, 0, image.width.toDouble(), image.height.toDouble()),
      );
      for (var y = region.top.ceil(); y < region.bottom.floor(); y++) {
        for (var x = region.left.ceil(); x < region.right.floor(); x++) {
          final offset = (y * image.width + x) * 4;
          if (bytes!.getUint8(offset + 3) > 128 &&
              bytes.getUint8(offset) < 140 &&
              bytes.getUint8(offset + 1) < 140 &&
              bytes.getUint8(offset + 2) < 140) {
            pixels++;
          }
        }
      }
      return pixels;
    } finally {
      image.dispose();
    }
  }))!;
}
