import 'package:firebase_core/firebase_core.dart' show FirebaseOptions;
import 'package:mobile/core/config/app_flavor.dart';
import 'package:mobile/firebase_options_development.dart' as development;
import 'package:mobile/firebase_options_production.dart' as production;
import 'package:mobile/firebase_options_staging.dart' as staging;

FirebaseOptions firebaseOptionsForFlavor(AppFlavor appFlavor) {
  return switch (appFlavor) {
    AppFlavor.development => development.DefaultFirebaseOptions.currentPlatform,
    AppFlavor.staging => staging.DefaultFirebaseOptions.currentPlatform,
    AppFlavor.production => production.DefaultFirebaseOptions.currentPlatform,
  };
}
