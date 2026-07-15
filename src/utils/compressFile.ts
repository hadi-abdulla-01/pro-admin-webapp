import imageCompression from 'browser-image-compression';
import { PDFDocument } from 'pdf-lib';

/**
 * Compresses a file before uploading.
 * Handles images (JPEG, PNG, WebP) and performs a basic re-save for PDFs to strip bloated metadata.
 * Unrecognized file types are returned as-is.
 */
export async function compressFile(file: File): Promise<File> {
  const fileType = file.type;

  // Skip compression if the file is already small (less than 1 MB / "KB size")
  if (file.size < 1024 * 1024) {
    return file;
  }

  try {
    // 1. Handle Image Compression
    if (fileType.startsWith('image/')) {
      const options = {
        maxSizeMB: 1, // Target max size in MB
        maxWidthOrHeight: 1920,
        useWebWorker: true,
        initialQuality: 0.8,
      };

      const compressedBlob = await imageCompression(file, options);
      
      // If the original file is actually smaller (e.g. already tiny icon), use original
      if (compressedBlob.size >= file.size) {
        return file;
      }

      return new File([compressedBlob], file.name, {
        type: compressedBlob.type,
        lastModified: Date.now(),
      });
    }

    // 2. Handle PDF Compression (Basic Re-save)
    if (fileType === 'application/pdf') {
      const arrayBuffer = await file.arrayBuffer();
      
      // Load the PDF document
      const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
      
      // Save it back. This often strips out unreferenced objects and some bloated metadata
      const pdfBytes = await pdfDoc.save({ useObjectStreams: false });
      
      const compressedBlob = new Blob([pdfBytes as unknown as BlobPart], { type: 'application/pdf' });
      
      // If the re-saved file is somehow larger or the same, return original
      if (compressedBlob.size >= file.size) {
        return file;
      }

      return new File([compressedBlob], file.name, {
        type: 'application/pdf',
        lastModified: Date.now(),
      });
    }

    // 3. Unrecognized or unsupported format, return original
    return file;
  } catch (error) {
    console.warn('Failed to compress file, falling back to original:', error);
    // If anything goes wrong, return the original file to prevent upload failure
    return file;
  }
}
