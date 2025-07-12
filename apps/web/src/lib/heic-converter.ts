/**
 * Converts a HEIC file to JPEG using the backend API
 * @param file - The HEIC file to convert
 * @returns Promise<File> - The converted JPEG file
 */
export const convertHeicToJpeg = async (file: File): Promise<File> => {
  try {
    // Create form data for the API call
    const formData = new FormData();
    formData.append('file', file);

    // Call the backend API
    const response = await fetch('/api/v1/images/convert-heic', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json();

      // Create specific error types for proper translation
      if (errorData.error === 'HEIC_CONVERSION_TIMEOUT') {
        const timeoutError = new Error('HEIC_CONVERSION_TIMEOUT');
        timeoutError.name = 'HEIC_CONVERSION_TIMEOUT';
        throw timeoutError;
      } else if (errorData.error === 'HEIC_CONVERSION_MEMORY') {
        const memoryError = new Error('HEIC_CONVERSION_MEMORY');
        memoryError.name = 'HEIC_CONVERSION_MEMORY';
        throw memoryError;
      } else if (errorData.error === 'HEIC_CONVERSION_UNSUPPORTED') {
        const unsupportedError = new Error('HEIC_CONVERSION_UNSUPPORTED');
        unsupportedError.name = 'HEIC_CONVERSION_UNSUPPORTED';
        throw unsupportedError;
      } else if (errorData.error === 'HEIC_CONVERSION_FAILED') {
        const conversionError = new Error('HEIC_CONVERSION_FAILED');
        conversionError.name = 'HEIC_CONVERSION_FAILED';
        throw conversionError;
      }

      // Generic error handling
      throw new Error(`API Error: ${errorData.error || 'Unknown error'}`);
    }

    // Get the converted file data
    const convertedBuffer = await response.arrayBuffer();
    const convertedFileName =
      response.headers.get('X-Converted-Filename') ||
      file.name.replace(/\.(heic|heif)$/i, '.jpg');

    // Create a new File object with the converted data
    return new File([convertedBuffer], convertedFileName, {
      type: 'image/jpeg',
      lastModified: file.lastModified,
    });
  } catch (error) {
    console.error('HEIC conversion failed:', error);

    // Re-throw the error with preserved type information
    if (error instanceof Error && error.name) {
      throw error;
    }

    // Fallback error
    const conversionError = new Error('HEIC_CONVERSION_FAILED');
    conversionError.name = 'HEIC_CONVERSION_FAILED';
    throw conversionError;
  }
};

/**
 * Checks if a file is a HEIC/HEIF file
 * @param file - The file to check
 * @returns boolean - True if the file is HEIC/HEIF
 */
export const isHeicFile = (file: File): boolean => {
  return /\.(heic|heif)$/i.test(file.name);
};
