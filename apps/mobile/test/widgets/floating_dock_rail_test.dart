import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/widgets/assistant_morphing_dock.dart';
import 'package:mobile/features/shell/view/custom_navigation_bar.dart';
import 'package:mobile/features/shell/view/floating_dock_rail.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

void main() {
  for (final width in [320.0, 390.0, 430.0]) {
    for (final safe in [0.0, 34.0]) {
      for (final actionCount in [0, 1, 2]) {
        for (final keyboard in [false, true]) {
          testWidgets('Apps/Assistant width$width safe$safe '
              'actions$actionCount keyboard$keyboard', (tester) async {
            tester.view.physicalSize = Size(width, 900);
            tester.view.devicePixelRatio = 1;
            addTearDown(tester.view.resetPhysicalSize);
            addTearDown(tester.view.resetDevicePixelRatio);
            const navKey = ValueKey('navigation');
            Widget navigation() => MorphingNavigationBar(
              key: navKey,
              selectedKey: const ValueKey('tab-0'),
              onSelected: (_) {},
              children: List.generate(
                5,
                (i) => shad.NavigationItem(
                  key: ValueKey('tab-$i'),
                  child: Icon(Icons.home, key: ValueKey('icon-$i')),
                ),
              ),
            );
            Future<void> pump({required bool assistant}) async {
              await tester.pumpWidget(
                MaterialApp(
                  home: shad.Theme(
                    data: const shad.ThemeData(
                      colorScheme: shad.ColorSchemes.lightZinc,
                    ),
                    child: MediaQuery(
                      data: MediaQueryData(
                        size: Size(width, 900),
                        padding: EdgeInsets.only(bottom: keyboard ? 0 : safe),
                        viewInsets: EdgeInsets.only(bottom: keyboard ? 260 : 0),
                      ),
                      child: Scaffold(
                        body: Stack(
                          children: [
                            Positioned(
                              left: floatingDockHorizontalInset,
                              right: floatingDockHorizontalInset,
                              bottom:
                                  (keyboard ? 0 : safe) + floatingDockBottomGap,
                              child: assistant
                                  ? AssistantMorphingDock(
                                      isComposing: false,
                                      navigation: navigation(),
                                      composer: const SizedBox(),
                                      composeLabel: 'Compose',
                                      onCompose: () {},
                                    )
                                  : FloatingDockRail(
                                      navigation: navigation(),
                                      primary: actionCount >= 1
                                          ? const Icon(Icons.add)
                                          : null,
                                      secondary: actionCount >= 2
                                          ? const Icon(Icons.search)
                                          : null,
                                    ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              );
              await tester.pumpAndSettle();
            }

            await pump(assistant: false);
            final apps = tester.getRect(find.byKey(navKey));
            final firstIcon = tester.getRect(
              find.byKey(const ValueKey('icon-0')),
            );
            final primary = tester.getRect(
              find.byKey(const ValueKey('floating-dock-primary-slot')),
            );
            await pump(assistant: true);
            expect(tester.getRect(find.byKey(navKey)), apps);
            expect(
              tester.getRect(find.byKey(const ValueKey('icon-0'))),
              firstIcon,
            );
            expect(
              tester.getRect(
                find.byKey(const ValueKey('floating-dock-primary-slot')),
              ),
              primary,
            );
            final target = find.byWidgetPredicate(
              (widget) =>
                  widget is PositionedDirectional &&
                  widget.key == const ValueKey('tab-0'),
            );
            expect(tester.getSize(target).width, greaterThanOrEqualTo(44));
            expect(tester.getSize(target).height, greaterThanOrEqualTo(44));
            expect(
              900 - apps.bottom,
              (keyboard ? 260 : safe) + floatingDockBottomGap,
            );
            expect(tester.takeException(), isNull);
          });
        }
      }
    }
  }
  testWidgets('six-item mini-app keeps full rail without empty action slots', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(320, 900);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(
      MaterialApp(
        home: shad.Theme(
          data: const shad.ThemeData(colorScheme: shad.ColorSchemes.lightZinc),
          child: Scaffold(
            body: Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: floatingDockHorizontalInset,
              ),
              child: FloatingDockRail(
                reserveEmptyActions: false,
                navigation: MorphingNavigationBar(
                  selectedKey: const ValueKey('mini-0'),
                  onSelected: (_) {},
                  children: List.generate(
                    6,
                    (i) => shad.NavigationItem(
                      key: ValueKey('mini-$i'),
                      child: const Icon(Icons.home),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(
      find.byKey(const ValueKey('floating-dock-primary-slot')),
      findsNothing,
    );
    final target = find.byWidgetPredicate(
      (widget) =>
          widget is PositionedDirectional &&
          widget.key == const ValueKey('mini-0'),
    );
    expect(tester.getSize(target).width, greaterThanOrEqualTo(44));
    expect(tester.getSize(target).height, greaterThanOrEqualTo(44));
    expect(tester.takeException(), isNull);
  });
}
