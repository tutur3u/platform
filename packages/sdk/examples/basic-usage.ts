/**
 * Basic Usage Example for Tuturuuu SDK
 *
 * This example demonstrates basic operations with the SDK including
 * file uploads, listings, and document management.
 */

import { TuturuuuClient } from '../src';

// Initialize the client with your API key
const client = new TuturuuuClient('ttr_your_api_key_here');

async function main() {
  try {
    console.log('=== Tuturuuu SDK Basic Usage Example ===\n');

    // ===== Storage Operations =====

    console.log('1. Listing files in workspace...');
    const files = await client.storage.list({
      path: '',
      limit: 10,
      sortBy: 'created_at',
      sortOrder: 'desc',
    });
    console.log(`Found ${files.data.length} files`);
    console.log('Files:', files.data.map((f) => f.name).join(', '));
    console.log('');

    // Upload a file
    console.log('2. Uploading a file...');
    const fileContent = 'Hello from Tuturuuu SDK!';
    const file = new File([fileContent], 'example.txt', {
      type: 'text/plain',
    });

    const uploadResult = await client.storage.upload(file, {
      path: 'examples',
      upsert: true,
    });
    console.log('Upload successful:', uploadResult.data.path);
    console.log('');

    // Create a folder
    console.log('3. Creating a folder...');
    const folderResult = await client.storage.createFolder(
      'examples',
      'reports'
    );
    console.log('Folder created:', folderResult.data.path);
    console.log('');

    // Share a file
    console.log('4. Generating signed URL for file...');
    const shareResult = await client.storage.share('examples/example.txt', {
      expiresIn: 3600, // 1 hour
    });
    console.log('Signed URL:', shareResult.data.signedUrl);
    console.log('Expires at:', shareResult.data.expiresAt);
    console.log('');

    // Get storage analytics
    console.log('5. Fetching storage analytics...');
    const analytics = await client.storage.getAnalytics();
    console.log(`Total size: ${analytics.data.totalSize} bytes`);
    console.log(`File count: ${analytics.data.fileCount}`);
    console.log(
      `Usage: ${analytics.data.usagePercentage.toFixed(2)}% of limit`
    );
    console.log('');

    // ===== Document Operations =====

    console.log('6. Creating a document...');
    const document = await client.documents.create({
      name: 'Example Document',
      content: 'This is an example document created via the SDK.',
      isPublic: false,
    });
    console.log('Document created:', document.data.id);
    console.log('');

    console.log('7. Listing documents...');
    const documents = await client.documents.list({
      limit: 10,
      search: 'example',
    });
    console.log(`Found ${documents.data.length} documents`);
    console.log('');

    console.log('8. Updating document...');
    const updatedDocument = await client.documents.update(document.data.id, {
      name: 'Updated Example Document',
      content: 'This document has been updated!',
    });
    console.log('Document updated:', updatedDocument.data.name);
    console.log('');

    console.log('9. Getting document by ID...');
    const retrievedDocument = await client.documents.get(document.data.id);
    console.log('Retrieved document:', retrievedDocument.data.name);
    console.log('');

    console.log('10. Searching documents...');
    const searchResults = await client.documents.search('example');
    console.log(`Search found ${searchResults.data.length} documents`);
    console.log('');

    // Cleanup
    console.log('11. Cleaning up...');
    await client.documents.delete(document.data.id);
    console.log('Document deleted');
    await client.storage.delete(['examples/example.txt']);
    console.log('File deleted');
    console.log('');

    console.log('✅ All operations completed successfully!');
  } catch (error) {
    console.error('❌ Error:', error);
    if (error instanceof Error) {
      console.error('Message:', error.message);
      console.error('Stack:', error.stack);
    }
  }
}

// Run the example
main();
