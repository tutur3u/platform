const { readRegularFileSync } = require('../safe-fs');

function readPackage(file, maxBytes, code) {
  try {
    return readRegularFileSync(file, { maxBytes });
  } catch (error) {
    if (
      [
        'ERR_FS_FILE_TOO_LARGE',
        'ERR_FS_NOT_REGULAR',
        'ELOOP',
        'EISDIR',
      ].includes(error.code)
    ) {
      throw Object.assign(new Error('Invalid qualification file'), { code });
    }
    throw error;
  }
}

module.exports = { readPackage };
