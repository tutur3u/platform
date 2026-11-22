import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/auth/widgets/security_check_dialog.dart';
import 'package:mobile/features/shell/view/android_modal_back_bridge.dart';
import 'package:mobile/features/shell/view/shell_page.dart';

import 'shell_rail_harness.dart';

const ValueKey<String> _panel = ValueKey('security-check-panel');

/// What `MainActivity` asks before it handles Back on an exit route.
Future<Object?> _hasModal() async {
  const codec = StandardMethodCodec();
  ByteData? reply;
  await TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
      .handlePlatformMessage(
        AndroidModalBackBridge.channel.name,
        codec.encodeMethodCall(const MethodCall('hasModal')),
        (data) => reply = data,
      );
  return reply == null ? null : codec.decodeEnvelope(reply!);
}

/// The security check card is not a route, so the shell reports it to
/// Android and closes it on Back before the page navigates or exits.
void main() {
  setUp(mockShellBackChannel);

  testWidgets('Back on an exit route closes an open security check first', (
    tester,
  ) async {
    useShellWindow(tester, const Size(390, 844));
    final shell = await pumpRailShell(tester, Routes.apps);
    expect(await _hasModal(), isFalse);

    String? result = 'pending';
    final navigator = Navigator.of(
      tester.element(find.byType(ShellPage)),
      rootNavigator: true,
    );
    unawaited(
      showSecurityCheckPanel(
        navigator,
        challengeBuilder: (_, _, _) => const SizedBox(height: 65),
      ).then((token) => result = token),
    );
    await settleShell(tester);
    expect(find.byKey(_panel), findsOneWidget);
    // Android forwards Back to Flutter instead of offering to exit.
    expect(await _hasModal(), isTrue);

    await tester.binding.handlePopRoute();
    await settleShell(tester);
    expect(result, isNull);
    expect(find.byKey(_panel), findsNothing);
    expect(await _hasModal(), isFalse);
    // The page under the card did not move.
    expect(shell.path, Routes.apps);
    expect(tester.takeException(), isNull);
  });
}
