import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/view/floating_shell_dock.dart';
import 'package:mobile/features/shell/view/shell_chrome_actions.dart';
import 'package:mobile/features/shell/view/shell_dock_action_group_bar.dart';
import 'package:mobile/features/shell/view/shell_dock_more_sheet.dart';
import 'package:mobile/features/shell/view/shell_dock_slot.dart';

import '../../../helpers/pump_app.dart';

const _location = '/mail/message';
const _owner = 'mail-reader';
const _opacity = ValueKey<String>('floating-shell-dock-opacity');

ValueKey<(String, String)> _primaryKey(String id) =>
    ValueKey(('dock-primary', id));

/// The approved reader dock: Reply, Reply all, Forward and More in the pill,
/// Archive in the circle.
ShellDockActionGroup _readerGroup(
  List<String> log, {
  bool canSend = true,
  ShellDockGroupAction? primary,
  String theme = 'original',
}) {
  ShellDockGroupAction action(
    String id,
    IconData icon, {
    bool destructive = false,
    bool enabled = true,
  }) => ShellDockGroupAction(
    id: id,
    icon: icon,
    label: id,
    destructive: destructive,
    enabled: enabled,
    onPressed: () => log.add(id),
  );
  return ShellDockActionGroup(
    actions: [
      if (canSend) ...[
        action('Reply', Icons.reply),
        action('Reply all', Icons.reply_all),
        action('Forward', Icons.forward),
      ],
    ],
    primary: primary ?? action('Archive', Icons.archive_outlined),
    more: [
      [
        action('Inbox', Icons.inbox_outlined),
        action('Archive', Icons.archive_outlined),
        ShellDockChoice(
          id: 'theme',
          icon: Icons.contrast,
          label: 'Message theme',
          options: const [
            (id: 'original', label: 'Original'),
            (id: 'light', label: 'Light'),
            (id: 'dark', label: 'Dark'),
          ],
          selectedId: theme,
          onSelected: (id) => log.add('theme:$id'),
        ),
        action('Load remote images', Icons.image_outlined),
      ],
      [
        action('Star', Icons.star_outline),
        action('Mark unread', Icons.mark_email_unread_outlined),
        action('Move', Icons.drive_file_move_outline),
        action('Trash', Icons.delete_outline, destructive: true),
      ],
    ],
  );
}

class _Shell extends StatefulWidget {
  const _Shell({required this.page});

  final Widget page;

  @override
  State<_Shell> createState() => _ShellState();
}

class _ShellState extends State<_Shell> {
  final _slots = ShellDockSlotController();

  @override
  void dispose() {
    _slots.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    body: ShellDockScope(
      controller: _slots,
      child: FloatingShellDock(
        location: _location,
        bottomInset: 68,
        fixedZones: true,
        leading: const SizedBox.square(
          key: ValueKey('back-zone'),
          dimension: 52,
        ),
        navigation: const Text('Navigation'),
        child: widget.page,
      ),
    ),
  );
}

Future<void> _pump(
  WidgetTester tester,
  ShellChromeActionsCubit chrome,
  Widget page, {
  double width = 390,
}) async {
  tester.view.physicalSize = Size(width, 844);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    BlocProvider<ShellChromeActionsCubit>.value(
      value: chrome,
      child: sorbetTestApp(home: _Shell(page: page)),
    ),
  );
  await tester.pumpAndSettle();
}

Widget _ownerPage(ShellDockActionGroup? group) => ShellChromeActions(
  ownerId: _owner,
  locations: const {_location},
  actionGroup: group,
);

double _slotX(WidgetTester tester, Key key) =>
    tester.getCenter(find.byKey(key)).dx;

Future<void> _openMore(WidgetTester tester) async {
  await tester.tap(find.byKey(shellDockGroupMoreKey));
  await tester.pumpAndSettle();
}

void main() {
  late ShellChromeActionsCubit chrome;
  late List<String> log;

  setUp(() {
    chrome = ShellChromeActionsCubit();
    log = [];
  });
  tearDown(() => chrome.close());

  testWidgets('pill keeps registration order, appends More, and the circle '
      'holds the primary', (tester) async {
    await _pump(tester, chrome, _ownerPage(_readerGroup(log)));

    expect(find.text('Navigation'), findsNothing);
    final reply = _slotX(tester, shellDockGroupSlotKey('Reply'));
    final replyAll = _slotX(tester, shellDockGroupSlotKey('Reply all'));
    final forward = _slotX(tester, shellDockGroupSlotKey('Forward'));
    final more = _slotX(tester, shellDockGroupMoreKey);
    expect(reply < replyAll && replyAll < forward && forward < more, isTrue);
    expect(find.text('More'), findsOneWidget);
    expect(find.byKey(_primaryKey('Archive')), findsOneWidget);
    expect(find.byKey(const ValueKey('back-zone')), findsOneWidget);

    await tester.tap(find.byKey(shellDockGroupSlotKey('Forward')));
    await tester.tap(find.byKey(_primaryKey('Archive')));
    expect(log, ['Forward', 'Archive']);

    final semantics = tester.getSemantics(
      find.byKey(shellDockGroupSlotKey('Reply all')),
    );
    expect(semantics.label, 'Reply all');
    expect(semantics, isSemantics(isButton: true, isSelected: false));
  });

  testWidgets('a mailbox that cannot send shows only More', (tester) async {
    await _pump(tester, chrome, _ownerPage(_readerGroup(log, canSend: false)));
    expect(find.byKey(shellDockGroupMoreKey), findsOneWidget);
    expect(find.byKey(shellDockGroupSlotKey('Reply')), findsNothing);
  });

  testWidgets('the primary id is dropped from the pill and the sheet', (
    tester,
  ) async {
    final group = _readerGroup(
      log,
      primary: ShellDockGroupAction(
        id: 'Reply',
        icon: Icons.reply,
        label: 'Reply',
        onPressed: () => log.add('primary'),
      ),
    );
    await _pump(tester, chrome, _ownerPage(group));
    expect(find.byKey(shellDockGroupSlotKey('Reply')), findsNothing);
    expect(find.byKey(shellDockGroupSlotKey('Reply all')), findsOneWidget);
    expect(find.byKey(_primaryKey('Reply')), findsOneWidget);

    await tester.pumpWidget(const SizedBox());
    await _pump(tester, chrome, _ownerPage(_readerGroup(log)));
    await _openMore(tester);
    expect(find.byKey(shellDockMoreItemKey('Inbox')), findsOneWidget);
    expect(find.byKey(shellDockMoreItemKey('Archive')), findsNothing);
  });

  testWidgets('More sheet: sections, separator, choice and destructive row', (
    tester,
  ) async {
    await _pump(tester, chrome, _ownerPage(_readerGroup(log)));
    await _openMore(tester);

    for (final id in [
      'Inbox',
      'theme',
      'Load remote images',
      'Star',
      'Mark unread',
      'Move',
      'Trash',
    ]) {
      expect(find.byKey(shellDockMoreItemKey(id)), findsOneWidget, reason: id);
    }
    final separator = tester.getCenter(
      find.byKey(shellDockMoreSeparatorKey(1)),
    );
    expect(
      tester
          .getCenter(find.byKey(shellDockMoreItemKey('Load remote images')))
          .dy,
      lessThan(separator.dy),
    );
    expect(
      tester.getCenter(find.byKey(shellDockMoreItemKey('Star'))).dy,
      greaterThan(separator.dy),
    );

    final trash = tester.widget<Text>(find.text('Trash'));
    final tokens = AppTokens.of(tester.element(find.text('Trash')));
    expect(trash.style?.color, tokens.colorScheme.destructive);
    expect(
      tester.widget<Text>(find.text('Star')).style?.color,
      isNot(tokens.colorScheme.destructive),
    );
    expect(tester.getSemantics(find.text('Trash')).label, contains('Trash'));

    await tester.tap(find.text('Dark'));
    await tester.pumpAndSettle();
    expect(log, ['theme:dark']);
    expect(find.byKey(shellDockMoreItemKey('theme')), findsOneWidget);
    expect(
      tester.getSemantics(find.text('Dark')),
      isSemantics(isSelected: true),
    );
    expect(
      tester.getSemantics(find.text('Original')),
      isSemantics(isSelected: false),
    );
  });

  testWidgets('the dock hides while the sheet is open and returns after', (
    tester,
  ) async {
    await _pump(tester, chrome, _ownerPage(_readerGroup(log)));
    double opacity() =>
        tester.widget<AnimatedOpacity>(find.byKey(_opacity)).opacity;
    expect(opacity(), 1);

    await _openMore(tester);
    expect(chrome.state.modalHidesDock, isTrue);
    expect(opacity(), 0);

    await tester.tap(find.text('Mark unread'));
    await tester.pumpAndSettle();
    expect(log, ['Mark unread']);
    expect(chrome.state.modalHidesDock, isFalse);
    expect(opacity(), 1);
    expect(find.byKey(shellDockGroupSlotKey('Reply')), findsOneWidget);
  });

  testWidgets('disabled actions do not fire and announce disabled', (
    tester,
  ) async {
    final group = ShellDockActionGroup(
      actions: [
        ShellDockGroupAction(
          id: 'Reply',
          icon: Icons.reply,
          label: 'Reply',
          enabled: false,
          onPressed: () => log.add('Reply'),
        ),
      ],
      more: [
        [
          ShellDockGroupAction(
            id: 'Move',
            icon: Icons.drive_file_move_outline,
            label: 'Move',
            enabled: false,
            onPressed: () => log.add('Move'),
          ),
        ],
      ],
    );
    await _pump(tester, chrome, _ownerPage(group));
    await tester.tap(find.byKey(shellDockGroupSlotKey('Reply')));
    await tester.pump();
    expect(
      tester.getSemantics(find.byKey(shellDockGroupSlotKey('Reply'))),
      isSemantics(isEnabled: false),
    );
    await _openMore(tester);
    await tester.tap(find.text('Move'));
    await tester.pumpAndSettle();
    expect(log, isEmpty);
    expect(find.byKey(shellDockMoreItemKey('Move')), findsOneWidget);
  });

  testWidgets('disposing the owner restores the previous dock', (tester) async {
    final show = ValueNotifier(true);
    addTearDown(show.dispose);
    await _pump(
      tester,
      chrome,
      Column(
        children: [
          ShellChromeActions(
            ownerId: 'mail-list',
            locations: const {_location},
            actions: [
              ShellActionSpec(
                id: 'compose',
                icon: Icons.edit,
                tooltip: 'Compose',
                inDock: true,
                onPressed: () {},
              ),
            ],
          ),
          ValueListenableBuilder<bool>(
            valueListenable: show,
            builder: (_, visible, _) => visible
                ? _ownerPage(_readerGroup(log))
                : const SizedBox.shrink(),
          ),
        ],
      ),
    );
    expect(find.byKey(_primaryKey('Archive')), findsOneWidget);
    expect(find.byKey(_primaryKey('compose')), findsNothing);

    show.value = false;
    await tester.pumpAndSettle();
    expect(chrome.state.actionGroupForLocation(_location), isNull);
    expect(find.byKey(shellDockGroupMoreKey), findsNothing);
    expect(find.text('Navigation'), findsOneWidget);
    expect(find.byKey(_primaryKey('compose')), findsOneWidget);
  });

  testWidgets('narrow widths fold extra pill actions into More', (
    tester,
  ) async {
    await _pump(tester, chrome, _ownerPage(_readerGroup(log)), width: 300);
    expect(find.byKey(shellDockGroupSlotKey('Reply')), findsOneWidget);
    expect(find.byKey(shellDockGroupSlotKey('Reply all')), findsOneWidget);
    expect(find.byKey(shellDockGroupSlotKey('Forward')), findsNothing);
    final slot = tester.getSize(find.byKey(shellDockGroupSlotKey('Reply')));
    expect(slot.width, greaterThanOrEqualTo(44));

    await _openMore(tester);
    final forward = find.byKey(shellDockMoreItemKey('Forward'));
    expect(forward, findsOneWidget);
    expect(
      tester.getCenter(forward).dy,
      lessThan(tester.getCenter(find.byKey(shellDockMoreItemKey('Inbox'))).dy),
    );
    await tester.tap(find.text('Forward'));
    await tester.pumpAndSettle();
    expect(log, ['Forward']);
  });

  testWidgets('route push and pop swap groups without exceptions', (
    tester,
  ) async {
    final navigator = GlobalKey<NavigatorState>();
    await _pump(
      tester,
      chrome,
      Navigator(
        key: navigator,
        onGenerateRoute: (_) => MaterialPageRoute<void>(
          builder: (_) => _ownerPage(_readerGroup(log)),
        ),
      ),
    );
    expect(find.byKey(shellDockGroupSlotKey('Reply')), findsOneWidget);

    final other = ShellDockActionGroup(
      actions: [
        ShellDockGroupAction(
          id: 'Edit',
          icon: Icons.edit,
          label: 'Edit',
          onPressed: () {},
        ),
      ],
      primary: ShellDockGroupAction(
        id: 'Save',
        icon: Icons.check,
        label: 'Save',
        onPressed: () {},
      ),
    );
    final pushed = navigator.currentState!.push(
      MaterialPageRoute<void>(
        builder: (_) => ShellChromeActions(
          ownerId: 'draft',
          locations: const {_location},
          actionGroup: other,
        ),
      ),
    );
    for (var i = 0; i < 6; i++) {
      await tester.pump(const Duration(milliseconds: 60));
    }
    await tester.pumpAndSettle();
    expect(find.byKey(shellDockGroupSlotKey('Edit')), findsNothing);
    expect(find.byType(ShellDockActionGroupBar), findsNothing);
    expect(find.byKey(shellDockGroupMoreKey), findsNothing);
    expect(find.byKey(_primaryKey('Archive')), findsNothing);
    expect(find.byKey(_primaryKey('Save')), findsOneWidget);

    navigator.currentState!.pop();
    for (var i = 0; i < 6; i++) {
      await tester.pump(const Duration(milliseconds: 60));
    }
    await tester.pumpAndSettle();
    await pushed;
    expect(find.byKey(shellDockGroupSlotKey('Edit')), findsNothing);
    expect(find.byKey(shellDockGroupSlotKey('Reply')), findsOneWidget);
    expect(find.byKey(_primaryKey('Archive')), findsOneWidget);
    expect(find.byKey(_primaryKey('Save')), findsNothing);
    expect(tester.takeException(), isNull);
  });
}
