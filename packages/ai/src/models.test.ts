import { describe, expect, it } from 'vitest';
import { defaultModel, models, providers } from './models';

describe('models', () => {
  it('should have unique model values within each provider', () => {
    const modelsByProvider = models.reduce(
      (acc, model) => {
        if (!acc[model.provider]) acc[model.provider] = [];
        acc[model.provider]?.push(model.value);
        return acc;
      },
      {} as Record<string, string[]>
    );

    Object.entries(modelsByProvider).forEach(([provider, values]) => {
      const uniqueValues = new Set(values);
      expect(
        values.length,
        `Duplicate models found in provider ${provider}`
      ).toBe(uniqueValues.size);
    });
  });

  it('should have required properties for each model', () => {
    models.forEach((model) => {
      expect(model).toHaveProperty('value');
      expect(model).toHaveProperty('label');
      expect(model).toHaveProperty('provider');
      expect(model).toHaveProperty('description');
    });
  });

  it('should have valid context window sizes', () => {
    models.forEach((model) => {
      if (model.context) {
        expect(model.context).toBeGreaterThan(0);
        expect(Number.isInteger(model.context)).toBe(true);
      }
    });
  });

  it('should sort models correctly with disabled ones at the end', () => {
    const enabledModels = models.filter((model) => !model.disabled);
    const disabledModels = models.filter((model) => model.disabled);

    // Check all enabled models come before disabled ones
    const lastEnabledModel = enabledModels[enabledModels.length - 1];
    const lastEnabledIndex = lastEnabledModel
      ? models.lastIndexOf(lastEnabledModel)
      : -1;

    const firstDisabledModel = disabledModels[0];
    const firstDisabledIndex = firstDisabledModel
      ? models.indexOf(firstDisabledModel)
      : models.length;
    expect(lastEnabledIndex).toBeLessThan(firstDisabledIndex);

    // Check enabled models are sorted by provider
    for (let i = 1; i < enabledModels.length; i++) {
      const prevProvider = enabledModels[i - 1]?.provider ?? '';
      const currentProvider = enabledModels[i]?.provider ?? '';
      expect(prevProvider.localeCompare(currentProvider)).toBeLessThanOrEqual(
        0
      );
    }

    if (disabledModels.length > 0) {
      const allProviders = models.map((model) => model.provider);
      const sortedEnabledModels = enabledModels.map((model) => model.provider);
      expect(
        allProviders.indexOf(sortedEnabledModels[0] as string)
      ).toBeLessThan(allProviders.indexOf(disabledModels[0]?.provider));
    }
  });
});

describe('defaultModel', () => {
  it('should select Vertex AI Gemini 2.0 Flash as default if available', () => {
    expect(defaultModel).toBeDefined();
    expect(defaultModel?.value).toBe('gemini-2.0-flash-001');
    expect(defaultModel?.provider).toBe('Google');
  });

  it('should not be disabled', () => {
    expect(defaultModel?.disabled).toBeFalsy();
  });
});

describe('providers', () => {
  it('should contain unique provider names', () => {
    const uniqueProviders = new Set(providers);
    expect(providers.length).toBe(uniqueProviders.size);
  });

  it('should include all providers from models', () => {
    const modelProviders = new Set(models.map((model) => model.provider));
    providers.forEach((provider) => {
      expect(modelProviders.has(provider)).toBe(true);
    });
  });

  it('should match the providers from models exactly', () => {
    const modelProviders = Array.from(
      new Set(models.map((model) => model.provider))
    );
    expect(providers).toEqual(modelProviders);
  });
});
