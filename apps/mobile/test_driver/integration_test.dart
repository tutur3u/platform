import 'package:integration_test/integration_test_driver.dart';

/// Host-side driver for `flutter drive`. Screenshots are captured by the host
/// runner (scripts/thanh-e2e) from `E2E_SHOT` markers in the device log.
Future<void> main() => integrationDriver();
