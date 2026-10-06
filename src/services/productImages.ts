import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const directory = path.resolve(process.cwd(), 'uploads', 'products');

export function productImageDirectory(): string {
  return directory;
}

export function storedImagePath(value?: string | null): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (/^(file|content|ph|assets-library):/i.test(trimmed)) return undefined;
  if (/^[a-zA-Z]:[\\/]/.test(trimmed) || trimmed.startsWith('\\\\')) return undefined;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  if (trimmed.startsWith('/media/products/')) return trimmed;
  return undefined;
}

export async function saveProductImage(productId: string, image: Buffer, mimeType: string): Promise<string> {
  const extension = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
  const filename = `${productId}-${randomBytes(8).toString('hex')}.${extension}`;
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, filename), image);
  return `/media/products/${filename}`;
}
