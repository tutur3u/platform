import 'package:mobile/app/app.dart';
import 'package:mobile/bootstrap.dart';
import 'package:mobile/core/config/app_flavor.dart';

Future<void> main() async {
  await bootstrap(
    AppFlavor.staging,
    ({
      required appFlavor,
      required initialThemeMode,
      required initialAppearance,
      initialRoute,
    }) => App(
      appFlavor: appFlavor,
      initialRoute: initialRoute,
      initialThemeMode: initialThemeMode,
      initialAppearance: initialAppearance,
    ),
  );
}
