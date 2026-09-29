import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/interaction/app_haptics.dart';
import 'package:mobile/features/shell/view/custom_navigation_bar.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

import '../helpers/helpers.dart';

void main() {
  testWidgets('tapping a floating tab requests selection haptics', (
    tester,
  ) async {
    debugDefaultTargetPlatformOverride = TargetPlatform.android;
    final originalEnabled = AppHaptics.enabled;
    AppHaptics.enabled = true;
    final calls = <MethodCall>[];
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
      SystemChannels.platform,
      (call) async {
        if (call.method == 'HapticFeedback.vibrate') calls.add(call);
        return null;
      },
    );
    addTearDown(() {
      debugDefaultTargetPlatformOverride = null;
      AppHaptics.enabled = originalEnabled;
      tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
        SystemChannels.platform,
        null,
      );
    });
    await tester.pumpApp(
      Center(
        child: MorphingNavigationBar(
          selectedKey: const ValueKey('home'),
          onSelected: (_) {},
          children: const [
            shad.NavigationItem(key: ValueKey('home'), child: Text('Home')),
            shad.NavigationItem(key: ValueKey('apps'), child: Text('Apps')),
          ],
        ),
      ),
    );
    await tester.tap(find.text('Apps'));
    await tester.pump();
    expect(
      calls.any(
        (call) => call.arguments == 'HapticFeedbackType.selectionClick',
      ),
      isTrue,
    );
    debugDefaultTargetPlatformOverride = null;
  });

  testWidgets('tap glides the highlight without a button splash', (
    tester,
  ) async {
    Key? selected = const ValueKey('home');
    late StateSetter rebuild;
    await tester.pumpApp(
      StatefulBuilder(
        builder: (context, setState) {
          rebuild = setState;
          return Center(
            child: MorphingNavigationBar(
              selectedKey: selected,
              onSelected: (key) => rebuild(() => selected = key),
              children: const [
                shad.NavigationItem(key: ValueKey('home'), child: Text('Home')),
                shad.NavigationItem(key: ValueKey('apps'), child: Text('Apps')),
              ],
            ),
          );
        },
      ),
    );

    final pill = find.byKey(const ValueKey('navigation-selection-indicator'));
    final homeX = tester.getCenter(pill).dx;
    final appsX = tester.getCenter(find.text('Apps')).dx;
    final appsInk = tester.widget<InkWell>(
      find
          .ancestor(of: find.text('Apps'), matching: find.byType(InkWell))
          .first,
    );
    expect(appsInk.splashFactory, NoSplash.splashFactory);
    expect(appsInk.highlightColor, Colors.transparent);

    final gesture = await tester.startGesture(
      tester.getCenter(find.text('Apps')),
    );
    await tester.pump();
    expect(tester.getCenter(pill).dx, closeTo(homeX, 1));
    expect(find.byKey(const ValueKey('navigation-drag-preview')), findsNothing);
    await gesture.up();
    await tester.pump();
    expect(tester.getCenter(pill).dx, closeTo(homeX, 1));
    await tester.pump(const Duration(milliseconds: 140));
    expect(tester.getCenter(pill).dx, greaterThan(homeX));
    expect(tester.getCenter(pill).dx, lessThan(appsX));
    await tester.pumpAndSettle();
    expect(tester.getCenter(pill).dx, closeTo(appsX, 1));
  });

  testWidgets('background rebuild retains drag and uses the current callback', (
    tester,
  ) async {
    late StateSetter rebuild;
    var generation = 0;
    int? invoked;
    await tester.pumpApp(
      StatefulBuilder(
        builder: (context, setState) {
          rebuild = setState;
          final current = generation;
          return Center(
            child: MorphingNavigationBar(
              selectedKey: const ValueKey('home'),
              onSelected: (_) => invoked = current,
              children: const [
                shad.NavigationItem(key: ValueKey('home'), child: Text('Home')),
                shad.NavigationItem(key: ValueKey('apps'), child: Text('Apps')),
              ],
            ),
          );
        },
      ),
    );
    final gesture = await tester.startGesture(
      tester.getCenter(find.text('Home')),
    );
    await tester.pump(const Duration(milliseconds: 600));
    rebuild(() => generation++);
    await tester.pump();
    expect(
      find.byKey(const ValueKey('navigation-drag-preview')),
      findsOneWidget,
    );
    await gesture.moveTo(tester.getCenter(find.text('Apps')));
    await gesture.up();
    await tester.pumpAndSettle();
    expect(invoked, 1);
  });

  testWidgets('hold previews the finger position and commits only on release', (
    tester,
  ) async {
    Key? selected;
    await tester.pumpApp(
      Center(
        child: MorphingNavigationBar(
          selectedKey: const ValueKey('home'),
          onSelected: (key) => selected = key,
          children: const [
            shad.NavigationItem(key: ValueKey('home'), child: Text('Home')),
            shad.NavigationItem(key: ValueKey('apps'), child: Text('Apps')),
            shad.NavigationItem(
              key: ValueKey('notifications'),
              child: Text('Notifications'),
            ),
          ],
        ),
      ),
    );
    final gesture = await tester.startGesture(
      tester.getCenter(find.text('Home')),
    );
    await tester.pump(const Duration(milliseconds: 600));
    expect(
      find.byKey(const ValueKey('navigation-drag-preview')),
      findsOneWidget,
    );
    expect(find.byType(Tooltip), findsNothing);
    await gesture.moveTo(tester.getCenter(find.text('Notifications')));
    await tester.pump();
    expect(selected, isNull);
    await gesture.up();
    await tester.pumpAndSettle();
    expect(selected, const ValueKey('notifications'));
    expect(find.byKey(const ValueKey('navigation-drag-preview')), findsNothing);
  });

  testWidgets('a swipe tracks the finger without waiting for a hold', (
    tester,
  ) async {
    Key? selected;
    await tester.pumpApp(
      Center(
        child: MorphingNavigationBar(
          selectedKey: const ValueKey('home'),
          onSelected: (key) => selected = key,
          children: const [
            shad.NavigationItem(key: ValueKey('home'), child: Text('Home')),
            shad.NavigationItem(key: ValueKey('apps'), child: Text('Apps')),
          ],
        ),
      ),
    );
    final gesture = await tester.startGesture(
      tester.getCenter(find.text('Home')),
    );
    await gesture.moveBy(const Offset(20, 0));
    await gesture.moveTo(tester.getCenter(find.text('Apps')));
    await tester.pump();
    expect(
      find.byKey(const ValueKey('navigation-drag-preview')),
      findsOneWidget,
    );
    expect(selected, isNull);
    await gesture.up();
    await tester.pumpAndSettle();
    expect(selected, const ValueKey('apps'));
  });

  testWidgets('release picks the nearest enabled tab between slots', (
    tester,
  ) async {
    Key? selected;
    await tester.pumpApp(
      Center(
        child: MorphingNavigationBar(
          selectedKey: const ValueKey('home'),
          onSelected: (key) => selected = key,
          children: const [
            shad.NavigationItem(key: ValueKey('home'), child: Text('Home')),
            shad.NavigationItem(
              key: ValueKey('disabled'),
              enabled: false,
              child: Text('Disabled'),
            ),
          ],
        ),
      ),
    );
    final gesture = await tester.startGesture(
      tester.getCenter(find.text('Home')),
    );
    await tester.pump(const Duration(milliseconds: 600));
    await gesture.moveTo(tester.getCenter(find.text('Disabled')));
    await gesture.up();
    await tester.pumpAndSettle();
    expect(selected, const ValueKey('home'));

    selected = null;
    final outside = await tester.startGesture(
      tester.getCenter(find.text('Home')),
    );
    await tester.pump(const Duration(milliseconds: 600));
    final bounds = tester.getRect(
      find.byKey(const ValueKey('navigation-morph-bounds')),
    );
    await outside.moveTo(Offset(bounds.right + 120, bounds.top - 140));
    await tester.pump(const Duration(milliseconds: 100));
    await tester.pump(const Duration(milliseconds: 100));
    expect(
      tester
          .getCenter(find.byKey(const ValueKey('navigation-drag-preview')))
          .dx,
      closeTo(bounds.right - 28, 3),
    );
    await outside.up();
    await tester.pumpAndSettle();
    expect(selected, const ValueKey('home'));
  });

  testWidgets('release between tabs follows the nearest highlight center', (
    tester,
  ) async {
    Key? selected = const ValueKey('home');
    late StateSetter rebuild;
    await tester.pumpApp(
      StatefulBuilder(
        builder: (context, setState) {
          rebuild = setState;
          return Center(
            child: MorphingNavigationBar(
              selectedKey: selected,
              onSelected: (key) => rebuild(() => selected = key),
              children: const [
                shad.NavigationItem(key: ValueKey('home'), child: Text('Home')),
                shad.NavigationItem(key: ValueKey('apps'), child: Text('Apps')),
                shad.NavigationItem(
                  key: ValueKey('profile'),
                  child: Text('Profile'),
                ),
              ],
            ),
          );
        },
      ),
    );
    final home = tester.getCenter(find.text('Home'));
    final profile = tester.getCenter(find.text('Profile'));
    final gesture = await tester.startGesture(home);
    await tester.pump(const Duration(milliseconds: 600));
    final freeformPosition = Offset(profile.dx - 18, profile.dy);
    await gesture.moveTo(freeformPosition);
    await tester.pump();
    final preview = find.byKey(const ValueKey('navigation-drag-preview'));
    expect(tester.getCenter(preview).dx, closeTo(freeformPosition.dx, 1));
    expect(selected, const ValueKey('home'));
    await gesture.up();
    await tester.pumpAndSettle();
    expect(selected, const ValueKey('profile'));
    final pill = find.byKey(const ValueKey('navigation-selection-indicator'));
    expect(tester.getCenter(pill).dx, closeTo(profile.dx, 1));
  });

  testWidgets('drag outside the bar commits the slot under the clamped pill', (
    tester,
  ) async {
    Key? selected;
    await tester.pumpApp(
      Center(
        child: MorphingNavigationBar(
          selectedKey: const ValueKey('home'),
          onSelected: (key) => selected = key,
          children: const [
            shad.NavigationItem(key: ValueKey('home'), child: Text('Home')),
            shad.NavigationItem(key: ValueKey('apps'), child: Text('Apps')),
          ],
        ),
      ),
    );
    final bounds = tester.getRect(
      find.byKey(const ValueKey('navigation-morph-bounds')),
    );
    final gesture = await tester.startGesture(
      tester.getCenter(find.text('Home')),
    );
    await gesture.moveTo(Offset(bounds.right + 100, bounds.top - 160));
    await tester.pump(const Duration(milliseconds: 100));
    await tester.pump(const Duration(milliseconds: 100));
    expect(selected, isNull);
    expect(
      tester
          .getCenter(find.byKey(const ValueKey('navigation-drag-preview')))
          .dx,
      closeTo(bounds.right - 28, 3),
    );
    await gesture.up();
    await tester.pumpAndSettle();
    expect(selected, const ValueKey('apps'));
  });

  testWidgets('width and retained items interpolate on entry and exit', (
    tester,
  ) async {
    var ids = ['a', 'b', 'c'];
    late StateSetter rebuild;
    Key? tapped;
    await tester.pumpApp(
      StatefulBuilder(
        builder: (context, setState) {
          rebuild = setState;
          return Center(
            child: MorphingNavigationBar(
              selectedKey: const ValueKey('a'),
              onSelected: (key) => tapped = key,
              children: [
                for (final id in ids)
                  shad.NavigationItem(key: ValueKey(id), child: Text(id)),
              ],
            ),
          );
        },
      ),
    );
    final bounds = find.byKey(const ValueKey('navigation-morph-bounds'));
    double width() => tester.getSize(bounds).width;
    final initial = width();
    final startB = tester.getCenter(find.text('b'));
    rebuild(() => ids = ['a', 'x', 'c', 'b', 'd']);
    await tester.pump();
    expect(width(), initial);
    expect(tester.getCenter(find.text('b')), startB);
    await tester.pump(const Duration(milliseconds: 180));
    expect(width(), greaterThan(initial));
    expect(width(), lessThan(264));
    final middleB = tester.getCenter(find.text('b'));
    await tester.pumpAndSettle();
    expect(width(), 264);
    expect(tester.getCenter(find.text('b')).dx, greaterThan(middleB.dx));
    await tester.tap(find.text('d'));
    expect(tapped, const ValueKey('d'));
    rebuild(() => ids = ['a', 'b', 'c']);
    await tester.pump();
    expect(width(), 264);
    await tester.pump(const Duration(milliseconds: 180));
    expect(width(), greaterThan(initial));
    expect(width(), lessThan(264));
    tapped = null;
    await tester.tap(find.text('d'), warnIfMissed: false);
    expect(tapped, isNull);
    await tester.pumpAndSettle();
    expect(width(), initial);
    expect(find.text('d'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('rapid reversal continues from the current geometry', (
    tester,
  ) async {
    var count = 3;
    late StateSetter rebuild;
    await tester.pumpApp(
      StatefulBuilder(
        builder: (context, setState) {
          rebuild = setState;
          return Center(
            child: MorphingNavigationBar(
              selectedKey: const ValueKey(0),
              onSelected: (_) {},
              children: [
                for (var i = 0; i < count; i++)
                  shad.NavigationItem(key: ValueKey(i), child: Text('$i')),
              ],
            ),
          );
        },
      ),
    );
    final bounds = find.byKey(const ValueKey('navigation-morph-bounds'));
    rebuild(() => count = 6);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 120));
    final before = tester.getSize(bounds);
    final position = tester.getCenter(find.text('1'));
    rebuild(() => count = 4);
    await tester.pump();
    expect(tester.getSize(bounds), before);
    expect(tester.getCenter(find.text('1')), position);
    await tester.pumpAndSettle();
    expect(tester.getSize(bounds).width, 212);
  });

  testWidgets('reduced motion updates immediately without outgoing controls', (
    tester,
  ) async {
    var count = 5;
    late StateSetter rebuild;
    await tester.pumpApp(
      StatefulBuilder(
        builder: (context, setState) {
          rebuild = setState;
          return MediaQuery(
            data: MediaQuery.of(context).copyWith(disableAnimations: true),
            child: Center(
              child: MorphingNavigationBar(
                selectedKey: const ValueKey(0),
                onSelected: (_) {},
                children: [
                  for (var i = 0; i < count; i++)
                    shad.NavigationItem(key: ValueKey(i), child: Text('$i')),
                ],
              ),
            ),
          );
        },
      ),
    );
    rebuild(() => count = 3);
    await tester.pump();
    expect(find.text('4'), findsNothing);
    expect(
      tester
          .getSize(find.byKey(const ValueKey('navigation-morph-bounds')))
          .width,
      160,
    );
  });
}
