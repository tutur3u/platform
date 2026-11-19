import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/chat/cubit/chat_cubit.dart';
import 'package:mobile/features/chat/widgets/chat_sheets.dart';

import '../../helpers/design_render_harness.dart';

Future<void> _pump(
  WidgetTester tester, {
  required Widget sheet,
  required Brightness brightness,
}) async {
  DesignRender.setSize(tester, DesignRender.sizes['phone']!);
  final settings = brightness == Brightness.dark
      ? DesignRender.themes['dark']!.$1
      : DesignRender.themes['light']!.$1;
  final cubit = ChatCubit(currentUserId: () => 'me');
  addTearDown(cubit.close);
  await tester.pumpWidget(
    DesignRenderApp(
      settings: settings,
      brightness: brightness,
      child: BlocProvider<ChatCubit>.value(value: cubit, child: sheet),
    ),
  );
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 50));
}

void main() {
  setUpAll(DesignRender.loadFonts);

  for (final brightness in [Brightness.light, Brightness.dark]) {
    final name = brightness.name;

    testWidgets('chat create sheet $name', (tester) async {
      await _pump(
        tester,
        brightness: brightness,
        sheet: const ChatCreateConversationSheet(),
      );
      expect(find.text('Create conversation'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await DesignRender.capture(tester, 'chat-create-$name');
    });

    testWidgets('chat directory sheet $name', (tester) async {
      await _pump(
        tester,
        brightness: brightness,
        sheet: const ChatDirectorySheet(),
      );
      expect(find.text('Directory'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await DesignRender.capture(tester, 'chat-directory-$name');
    });
  }
}
