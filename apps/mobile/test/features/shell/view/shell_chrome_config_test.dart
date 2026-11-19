import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/shell/view/shell_chrome_config.dart';
import 'package:mobile/l10n/l10n.dart';

import '../../../helpers/helpers.dart';

void main() {
  for (final (locale, title) in const [
    (Locale('en'), 'Notifications'),
    (Locale('vi'), 'Thông báo'),
  ]) {
    testWidgets('Notifications is titled like its dock tab in $locale', (
      tester,
    ) async {
      String? resolved;
      String? dockLabel;
      await tester.pumpApp(
        Builder(
          builder: (outer) => Localizations.override(
            context: outer,
            locale: locale,
            child: Builder(
              builder: (context) {
                resolved = ShellChromeConfig.forLocation(
                  context,
                  Routes.notifications,
                ).title;
                dockLabel = context.l10n.notificationsTitle;
                return const SizedBox.shrink();
              },
            ),
          ),
        ),
      );
      expect(resolved, title);
      expect(resolved, dockLabel);
    });
  }
}
