/**
 * Pasted and dropped pictures are re-encoded in the browser before they join
 * the board. Re-encoding keeps boards inside the shared size limit and turns
 * any input (including SVG or animated files) into a plain still image.
 */
import { MAX_IMAGE_CHARS } from '../shared/board';
export { MAX_IMAGE_CHARS };
const MAX_INPUT_BYTES = 30_000_000;
const ATTEMPTS: [side: number, quality: number][] = [
  [1600, 0.85],
  [1280, 0.8],
  [1024, 0.72],
  [800, 0.65],
  [640, 0.6],
];

export type PreparedImage = { src: string; width: number; height: number };

function encode(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, type, quality),
  );
}
function dataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export async function prepareImage(file: Blob): Promise<PreparedImage> {
  if (!file.type.startsWith('image/'))
    throw new Error('Only pictures can be pasted onto the board.');
  if (file.size > MAX_INPUT_BYTES)
    throw new Error('This picture is too large. The limit is 30 MB.');
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error('This picture could not be read.');
  }
  try {
    for (const [side, quality] of ATTEMPTS) {
      const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d')!.drawImage(bitmap, 0, 0, width, height);
      // WebP keeps transparency; browsers that can't write it fall back to PNG.
      let blob = await encode(canvas, 'image/webp', quality);
      if (!blob || blob.type !== 'image/webp')
        blob = await encode(canvas, 'image/jpeg', quality);
      if (!blob) continue;
      const src = await dataUrl(blob);
      if (src.length <= MAX_IMAGE_CHARS) return { src, width, height };
    }
  } finally {
    bitmap.close();
  }
  throw new Error('This picture is too detailed to fit on the board.');
}

/** PNG copy of a board picture, for the system clipboard. */
export async function imagePng(src: string): Promise<Blob> {
  const image = new Image();
  image.src = src;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  canvas.getContext('2d')!.drawImage(image, 0, 0);
  const blob = await encode(canvas, 'image/png', 1);
  if (!blob) throw new Error('This picture could not be copied.');
  return blob;
}
