import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/repositories/timezone_settings_repository.dart';
import 'package:mobile/data/sources/api_exception.dart';
import 'package:mobile/features/settings/cubit/timezone_settings_cubit.dart';

class DiagnosticRepository extends TimezoneSettingsRepository {
  DiagnosticRepository({super.clock});
  Exception? readFailure;
  Exception? writeFailure;
  int reads = 0;
  @override
  Future<String> loadPersonal() async {
    reads++;
    if (readFailure case final failure?) throw failure;
    return 'UTC';
  }

  @override
  Future<String> savePersonal(String zone) async {
    if (writeFailure case final failure?) throw failure;
    return zone;
  }
}

void main() {
  test(
    'read cooldown retains safe diagnostics without repeated requests',
    () async {
      var now = DateTime.utc(2026);
      final repository = DiagnosticRepository(clock: () => now)
        ..readFailure = const ApiException(
          message: 'synthetic-private',
          statusCode: 429,
          retryAfter: 60,
        );
      final cubit = TimezoneSettingsCubit(
        repository: repository,
        deviceLoader: () async => 'UTC',
        clock: () => now,
      );
      addTearDown(() async {
        await cubit.close();
        repository.dispose();
      });
      await cubit.load(userId: 'synthetic-a', workspaceId: null);
      expect(
        cubit.state.diagnostics?.summary,
        contains('status=429; retryAfter=60'),
      );
      expect(cubit.state.diagnostics?.summary, isNot(contains('private')));
      await cubit.load(userId: 'synthetic-a', workspaceId: null);
      expect(repository.reads, 1);
      expect(cubit.state.diagnostics, isNotNull);
      now = now.add(const Duration(seconds: 61));
      repository.readFailure = null;
      await cubit.reload();
      expect(cubit.state.diagnostics, isNull);
    },
  );
  test(
    'write failure diagnostics clear on recovery and account change',
    () async {
      final repository = DiagnosticRepository();
      final cubit = TimezoneSettingsCubit(
        repository: repository,
        deviceLoader: () async => 'UTC',
      );
      addTearDown(() async {
        await cubit.close();
        repository.dispose();
      });
      await cubit.load(userId: 'synthetic-a', workspaceId: null);
      repository.writeFailure = const ApiException(
        message: 'synthetic-private',
        statusCode: 503,
      );
      await cubit.save('UTC');
      expect(cubit.state.diagnostics?.summary, contains('stage=timezoneWrite'));
      repository.writeFailure = null;
      await cubit.save('UTC');
      expect(cubit.state.diagnostics, isNull);
      repository.writeFailure = const ApiException(
        message: 'synthetic-private',
        statusCode: 503,
      );
      await cubit.save('UTC');
      await cubit.load(userId: 'synthetic-b', workspaceId: null);
      expect(cubit.state.diagnostics, isNull);
    },
  );
}
