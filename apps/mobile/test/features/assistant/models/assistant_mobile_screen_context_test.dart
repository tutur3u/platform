import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/models/assistant_mobile_screen_context.dart';

void main() {
  test('shares only known sections and omits query parameters', () {
    expect(
      assistantMobileScreenContext(
        Uri.parse('/finance/wallets/private-id?token=secret'),
      ),
      {'screen': 'finance'},
    );
    expect(assistantMobileScreenContext(Uri.parse('/unknown/private-id')), {
      'screen': 'other',
    });
  });

  test('shares a task ID only for a direct task detail route', () {
    const taskId = '123e4567-e89b-12d3-a456-426614174000';
    expect(assistantMobileScreenContext(Uri.parse('/tasks/$taskId')), {
      'screen': 'tasks',
      'taskId': taskId,
    });
    expect(assistantMobileScreenContext(Uri.parse('/tasks/boards/$taskId')), {
      'screen': 'tasks',
    });
    expect(
      assistantMobileScreenContext(
        Uri.parse('/tasks/------------------------------------'),
      ),
      {'screen': 'tasks'},
    );
  });
}
