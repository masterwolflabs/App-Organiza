'use client';

export const MAX_LOGO_SOURCE_BYTES = 5 * 1024 * 1024; // 5MB upload cap before resizing

/**
 * Reads an image file and returns a small, resized data URL suitable for
 * storing many of them in localStorage (account logos, etc.).
 */
export function fileToResizedDataUrl(file: File, maxDim = 128): Promise<string> {
  return new Promise((resolve, reject) => {
    if (file.size > MAX_LOGO_SOURCE_BYTES) {
      reject(new Error('La imagen es muy pesada (máximo 5MB).'));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('No se pudo leer el archivo.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('No se pudo procesar la imagen.'));
      img.onload = () => {
        let { width, height } = img;
        if (width > height) {
          if (width > maxDim) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          }
        } else if (height > maxDim) {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('No se pudo procesar la imagen.'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/png', 0.9));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Downsizes a picture for a note (max `maxDim` px on the long side) and
 * re-encodes it: JPEG stays JPEG, everything else becomes PNG so transparent
 * backgrounds don't turn black. Returns the blob plus its final size.
 */
export function compressImageForNote(
  file: File,
  maxDim = 1600
): Promise<{ blob: Blob; width: number; height: number; ext: string }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('No se pudo procesar la imagen.'));
    };
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
      const width = Math.max(1, Math.round(img.naturalWidth * scale));
      const height = Math.max(1, Math.round(img.naturalHeight * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('No se pudo procesar la imagen.'));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      const isJpeg = file.type === 'image/jpeg';
      canvas.toBlob(
        (blob) => {
          if (!blob) reject(new Error('No se pudo procesar la imagen.'));
          else resolve({ blob, width, height, ext: isJpeg ? 'jpg' : 'png' });
        },
        isJpeg ? 'image/jpeg' : 'image/png',
        0.85
      );
    };
    img.src = url;
  });
}
