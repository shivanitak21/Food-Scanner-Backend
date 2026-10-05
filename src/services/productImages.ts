import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const directory = path.resolve(process.cwd(), 'uploads', 'products');

export function productImageDirectory(): string {
  return directory;
}

export async function saveProductImage(productId: string, image: Buffer, mimeType: string): Promise<string> {
  const extension = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
  const filename = `${productId}-${randomBytes(8).toString('hex')}.${extension}`;
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, filename), image);
  return `/media/products/${filename}`;
}
