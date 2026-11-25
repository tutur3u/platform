import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/shell/cubit/sidebar_behavior.dart';
import 'package:mobile/features/shell/cubit/sidebar_preferences.dart';
import 'package:mobile/features/shell/view/shell_sidebar_frame.dart';
import 'package:mocktail/mocktail.dart';

class _UnusedApiClient extends Mock implements ApiClient {}

/// Device preferences stay in the mocked `SharedPreferences`; the account
/// preference is empty and uploads are dropped, so no request leaves the test.
class FakeSidebarPreferences extends SidebarPreferences {
  FakeSidebarPreferences() : super(apiClient: _UnusedApiClient());

  final uploads = <SidebarBehavior>[];

  @override
  Future<SidebarBehavior?> loadAccount(String userId) async => null;

  @override
  Future<void> saveAccount(String userId, SidebarBehavior behavior) async {
    uploads.add(behavior);
  }
}

/// Replaces the sidebar preference store for every test in the file.
void useFakeSidebarPreferences() {
  setUp(
    () => ShellSidebarFrame.preferencesFactory = FakeSidebarPreferences.new,
  );
  tearDown(() => ShellSidebarFrame.preferencesFactory = SidebarPreferences.new);
}
