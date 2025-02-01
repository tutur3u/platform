import { z } from 'zod';

export const apiEndpointSchema = z
  .string()
  .url()
  .refine((url) => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }, 'Invalid API endpoint URL');

export const apiKeySchema = z
  .string()
  .min(16, 'API key must be at least 16 characters long')
  .max(256, 'API key must not exceed 256 characters');

export const workspaceIdSchema = z
  .string()
  .uuid('Workspace ID must be a valid UUID');

export type ValidationError = {
  field: string;
  message: string;
};

export const validateMigrationConfig = (config: {
  apiEndpoint: string;
  apiKey: string;
  workspaceId: string;
}): ValidationError[] => {
  const errors: ValidationError[] = [];

  try {
    apiEndpointSchema.parse(config.apiEndpoint);
  } catch (error) {
    if (error instanceof z.ZodError) {
      errors.push({
        field: 'apiEndpoint',
        message: error.errors[0]?.message || 'Invalid API endpoint',
      });
    }
  }

  try {
    apiKeySchema.parse(config.apiKey);
  } catch (error) {
    if (error instanceof z.ZodError) {
      errors.push({
        field: 'apiKey',
        message: error.errors[0]?.message || 'Invalid API key',
      });
    }
  }

  try {
    workspaceIdSchema.parse(config.workspaceId);
  } catch (error) {
    if (error instanceof z.ZodError) {
      errors.push({
        field: 'workspaceId',
        message: error.errors[0]?.message || 'Invalid workspace ID',
      });
    }
  }

  return errors;
};

export const validateModuleData = (data: any[]): boolean => {
  // Handle empty data case
  if (!Array.isArray(data)) return false;
  if (data.length === 0) return true;

  // Basic validation: ensure all items are objects
  if (!data.every((item) => item && typeof item === 'object')) return false;

  // Get the first item's keys for comparison
  const firstItem = data[0];
  const requiredKeys = Object.keys(firstItem).filter(
    (key) =>
      // Consider a field required if it's not null/undefined in the first item
      firstItem[key] != null
  );

  // If no required keys, any object array is valid
  if (requiredKeys.length === 0) return true;

  // Check if all items have the required fields with compatible types
  return data.every((item) => {
    return requiredKeys.every((key) => {
      // Skip validation if the value is null/undefined
      if (item[key] == null) return true;

      // Check type compatibility
      const firstItemType = typeof firstItem[key];
      const currentItemType = typeof item[key];

      // Allow number/string interchangeability for backward compatibility
      if (
        (firstItemType === 'number' && currentItemType === 'string') ||
        (firstItemType === 'string' && currentItemType === 'number')
      ) {
        return true;
      }

      return firstItemType === currentItemType;
    });
  });
};

export const sanitizeApiEndpoint = (endpoint: string): string => {
  try {
    const url = new URL(endpoint);
    return url.toString().replace(/\/$/, ''); // Remove trailing slash
  } catch {
    return endpoint;
  }
};
