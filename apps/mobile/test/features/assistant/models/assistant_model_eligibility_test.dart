import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/models/assistant_model_eligibility.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';

void main() {
  const available = AssistantGatewayModel(
    value: 'provider/model',
    label: 'Model',
    provider: 'Provider',
  );
  const disabled = AssistantGatewayModel(
    value: 'provider/model',
    label: 'Model',
    provider: 'Provider',
    disabled: true,
  );

  test('both picker policies accept full, bare and unrestricted model IDs', () {
    expect(isAssistantModelAllowed(available, ['provider/model']), isTrue);
    expect(isAssistantModelAllowed(available, ['model']), isTrue);
    expect(isAssistantModelAllowed(available, []), isTrue);
    expect(isAssistantModelAllowed(available, ['other/model']), isFalse);
  });
  test(
    'disabled models remain unavailable even when allowed or unrestricted',
    () {
      expect(isAssistantModelAllowed(disabled, ['provider/model']), isFalse);
      expect(isAssistantModelAllowed(disabled, ['model']), isFalse);
      expect(isAssistantModelAllowed(disabled, []), isFalse);
    },
  );
}
