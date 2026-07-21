import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/config/api_origins.dart';
import 'package:mobile/core/config/app_flavor.dart';

void main() {
  group('ApiOrigins', () {
    test('uses remote HTTPS owners for production without env overrides', () {
      final origins = ApiOrigins.forFlavor(AppFlavor.production);

      expect(origins.urlFor(ApiOrigin.platform), 'https://tuturuuu.com');
      expect(origins.urlFor(ApiOrigin.finance), 'https://finance.tuturuuu.com');
      expect(
        origins.urlFor(ApiOrigin.inventory),
        'https://inventory.tuturuuu.com',
      );
      expect(origins.urlFor(ApiOrigin.tasks), 'https://tasks.tuturuuu.com');
      expect(
        origins.urlFor(ApiOrigin.contacts),
        'https://contacts.tuturuuu.com',
      );
      expect(
        origins.urlFor(ApiOrigin.calendar),
        'https://calendar.tuturuuu.com',
      );
      expect(origins.urlFor(ApiOrigin.teach), 'https://teach.tuturuuu.com');
      expect(origins.urlFor(ApiOrigin.track), 'https://track.tuturuuu.com');
      expect(
        origins.urlFor(ApiOrigin.infrastructure),
        'https://infrastructure.tuturuuu.com',
      );
    });

    test('uses local app ports in development', () {
      final origins = ApiOrigins.forFlavor(AppFlavor.development);

      expect(origins.urlFor(ApiOrigin.platform), 'http://localhost:7803');
      expect(origins.urlFor(ApiOrigin.finance), 'http://localhost:7808');
      expect(origins.urlFor(ApiOrigin.inventory), 'http://localhost:7815');
      expect(origins.urlFor(ApiOrigin.tasks), 'http://localhost:7809');
    });

    test('honors explicit overrides and normalizes trailing slashes', () {
      final origins = ApiOrigins.forFlavor(
        AppFlavor.production,
        tasksOverride: 'https://tasks.example.com/',
      );

      expect(origins.urlFor(ApiOrigin.tasks), 'https://tasks.example.com');
    });

    test('rejects localhost in production', () {
      expect(
        () => ApiOrigins.forFlavor(
          AppFlavor.production,
          tasksOverride: 'http://localhost:7809',
        ),
        throwsStateError,
      );
    });

    test('routes satellite-owned API paths to their canonical apps', () {
      final origins = ApiOrigins.forFlavor(AppFlavor.production);

      final expectations = <String, ApiOrigin>{
        '/api/workspaces/ws/wallets': ApiOrigin.finance,
        '/api/workspaces/ws/transactions/infinite?page=1': ApiOrigin.finance,
        '/api/v1/workspaces/ws/finance/invoices': ApiOrigin.finance,
        '/api/v1/workspaces/ws/inventory/overview': ApiOrigin.inventory,
        '/api/v1/workspaces/ws/products/options': ApiOrigin.inventory,
        '/api/v1/workspaces/ws/task-boards?page=1': ApiOrigin.tasks,
        '/api/v1/users/me/tasks': ApiOrigin.tasks,
        '/api/v1/workspaces/ws/users/database': ApiOrigin.contacts,
        '/api/v1/workspaces/ws/calendar/events': ApiOrigin.calendar,
        '/api/v1/calendar/connections?wsId=ws': ApiOrigin.calendar,
        '/api/v1/workspaces/ws/courses': ApiOrigin.teach,
        '/api/v1/workspaces/ws/education/attempts': ApiOrigin.teach,
        '/api/v1/workspaces/ws/time-tracking/sessions': ApiOrigin.track,
        '/api/v1/infrastructure/mobile-versions': ApiOrigin.infrastructure,
      };

      for (final entry in expectations.entries) {
        expect(origins.ownerForPath(entry.key), entry.value, reason: entry.key);
      }
    });

    test('keeps mixed platform routes on the platform origin', () {
      final origins = ApiOrigins.forFlavor(AppFlavor.production);

      for (final path in <String>[
        '/api/v1/workspaces/ws/storage/upload-url',
        '/api/v1/workspaces/ws/members',
        '/api/v1/workspaces/ws/users/feedbacks',
        '/api/workspaces/ws/tags',
        '/api/workspaces/ws/transfers',
        '/api/v1/workspaces/ws/time-tracker/stats',
      ]) {
        expect(origins.ownerForPath(path), ApiOrigin.platform, reason: path);
      }
    });
  });
}
