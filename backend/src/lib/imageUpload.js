// Safe Product Image Upload & Magic-Byte Content Validation (REV-04, D12)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

const UPLOAD_DIR = path.join(__dirname, '../../public/uploads/products');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB
const MAX_IMAGES_PER_PRODUCT = 6;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES }
});

/**
 * Validate image buffer by magic bytes (PNG, JPEG, WEBP) rather than trusting extension/MIME
 */
function detectImageType(buffer) {
  if (!buffer || buffer.length < 12) return null;

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
    return 'png';
  }
  // JPEG: FF D8 FF
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    return 'jpg';
  }
  // WEBP: RIFF....WEBP
  if (
    buffer.slice(0, 4).toString('ascii') === 'RIFF' &&
    buffer.slice(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'webp';
  }
  return null;
}

function saveValidatedProductImage(buffer) {
  const ext = detectImageType(buffer);
  if (!ext) {
    const err = new Error('Invalid image file. Only PNG, JPG, and WEBP images (validated by content) are allowed.');
    err.statusCode = 400;
    throw err;
  }

  const filename = `${crypto.randomUUID()}.${ext}`;
  const fullPath = path.join(UPLOAD_DIR, filename);
  fs.writeFileSync(fullPath, buffer);
  return `/uploads/products/${filename}`;
}

module.exports = {
  upload,
  detectImageType,
  saveValidatedProductImage,
  MAX_FILE_SIZE_BYTES,
  MAX_IMAGES_PER_PRODUCT
};
