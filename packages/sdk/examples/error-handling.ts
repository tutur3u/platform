/**
 * Error Handling Example for Tuturuuu SDK
 *
 * This example demonstrates proper error handling patterns
 * when using the SDK.
 */

import {
  AuthenticationError,
  AuthorizationError,
  ConflictError,
  NetworkError,
  NotFoundError,
  RateLimitError,
  TuturuuuClient,
  ValidationError,
} from '../src';

const client = new TuturuuuClient('ttr_your_api_key_here');

async function demonstrateErrorHandling() {
  console.log('=== Error Handling Example ===\n');

  // Example 1: Handling authentication errors
  console.log('1. Authentication Error Example');
  try {
    const invalidClient = new TuturuuuClient('invalid_key');
    await invalidClient.storage.list();
  } catch (error) {
    if (error instanceof ValidationError) {
      console.log('❌ Validation Error:', error.message);
    }
  }
  console.log('');

  // Example 2: Handling not found errors
  console.log('2. Not Found Error Example');
  try {
    await client.documents.get('non-existent-id');
  } catch (error) {
    if (error instanceof NotFoundError) {
      console.log('❌ Not Found:', error.message);
      console.log('Error code:', error.code);
    }
  }
  console.log('');

  // Example 3: Handling conflicts
  console.log('3. Conflict Error Example');
  try {
    const file = new File(['content'], 'duplicate.txt');
    // First upload
    await client.storage.upload(file, { path: 'test' });
    // Second upload without upsert - will fail
    await client.storage.upload(file, { path: 'test', upsert: false });
  } catch (error) {
    if (error instanceof ConflictError) {
      console.log('❌ Conflict:', error.message);
      console.log('Hint: Set upsert=true to overwrite');
    }
  }
  console.log('');

  // Example 4: Generic error handling
  console.log('4. Generic Error Handling Pattern');
  try {
    await client.storage.list({ path: 'some/path' });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      console.log('❌ Authentication failed - check your API key');
    } else if (error instanceof AuthorizationError) {
      console.log('❌ Insufficient permissions for this operation');
    } else if (error instanceof NotFoundError) {
      console.log('❌ Resource not found');
    } else if (error instanceof ConflictError) {
      console.log('❌ Resource conflict - already exists');
    } else if (error instanceof RateLimitError) {
      console.log('❌ Rate limit exceeded - try again later');
    } else if (error instanceof NetworkError) {
      console.log('❌ Network error - check your connection');
    } else if (error instanceof ValidationError) {
      console.log('❌ Validation error - check your input');
    } else if (error instanceof Error) {
      console.log('❌ Unexpected error:', error.message);
    }
  }
  console.log('');

  // Example 5: Retry logic with exponential backoff
  console.log('5. Retry Logic Example');
  async function uploadWithRetry(file: File, maxRetries = 3): Promise<void> {
    let attempt = 0;
    while (attempt < maxRetries) {
      try {
        await client.storage.upload(file);
        console.log('✅ Upload successful');
        return;
      } catch (error) {
        attempt++;
        if (error instanceof RateLimitError && attempt < maxRetries) {
          const delay = 2 ** attempt * 1000;
          console.log(`⏳ Rate limited, retrying in ${delay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        } else if (error instanceof NetworkError && attempt < maxRetries) {
          const delay = 1000 * attempt;
          console.log(`⏳ Network error, retrying in ${delay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        } else {
          throw error;
        }
      }
    }
  }

  const testFile = new File(['test'], 'retry-test.txt');
  try {
    await uploadWithRetry(testFile);
  } catch (error) {
    console.log('❌ Upload failed after retries:', error);
  }
  console.log('');

  // Example 6: Validation before API calls
  console.log('6. Input Validation Example');
  try {
    // Validate inputs before making API calls
    const paths: string[] = [];
    if (paths.length === 0) {
      throw new ValidationError('Cannot delete zero files');
    }
    await client.storage.delete(paths);
  } catch (error) {
    if (error instanceof ValidationError) {
      console.log('❌ Validation failed:', error.message);
    }
  }
  console.log('');

  console.log('✅ Error handling examples completed!');
}

demonstrateErrorHandling().catch(console.error);
