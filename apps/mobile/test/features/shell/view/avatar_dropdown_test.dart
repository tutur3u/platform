import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/shell/view/avatar_dropdown_menu.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

void main() {
  testWidgets('uses the canonical avatar identity as the cached image key', (
    tester,
  ) async {
    await tester.pumpWidget(
      shad.ShadcnApp(
        theme: const shad.ThemeData(colorScheme: shad.ColorSchemes.lightZinc),
        darkTheme: const shad.ThemeData.dark(
          colorScheme: shad.ColorSchemes.darkZinc,
        ),
        localizationsDelegates: const [
          ...AppLocalizations.localizationsDelegates,
          shad.ShadcnLocalizations.delegate,
        ],
        supportedLocales: AppLocalizations.supportedLocales,
        home: Scaffold(
          body: AvatarDropdownTrigger(
            triggerKey: GlobalKey(),
            data: const AvatarDropdownMenuData(
              name: 'Casey',
              avatarUrl: 'https://cdn.example.com/avatar.png?token=abc',
              avatarIdentityKey: 'https://cdn.example.com/avatar.png',
              workspaceName: 'Workspace',
            ),
            onPressed: () {},
          ),
        ),
      ),
    );

    final image = tester.widget<Image>(find.byType(Image).first);
    final provider = image.image as CachedNetworkImageProvider;

    expect(provider.url, 'https://cdn.example.com/avatar.png?token=abc');
    expect(provider.cacheKey, 'https://cdn.example.com/avatar.png');
  });
}
