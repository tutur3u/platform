import 'package:mobile/app/app.dart';
import 'package:mobile/bootstrap.dart';

Future<void> main() async {
  await bootstrap(
    ({
      required initialThemeMode,
      initialRoute,
    }) => App(
      initialRoute: initialRoute,
      initialThemeMode: initialThemeMode,
    ),
  );
}
