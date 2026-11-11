import { createHash } from 'node:crypto';
import { ALLOWED_UPLOAD_TYPES, MAX_UPLOAD_BYTES } from '@/lib/config';
import { AppError } from '@/lib/errors';
import type { Ctx } from '../ctx';
import { withCtx, type Tx } from '../db';

export type FileKind = 'LICENCE' | 'INSURANCE' | 'SURVEY' | 'QUOTATION' | 'CONTRACT' | 'WORK_EVIDENCE' | 'COLLECTION' | 'COMPLIANCE' | 'INCIDENT' | 'PRODUCT' | 'OTHER';

const MAGIC: Record<string, (b: Buffer) => boolean> = {
  'application/pdf': (b) => b.subarray(0, 4).toString('latin1') === '%PDF',
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8,
  'image/png': (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/webp': (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP',
};

/** Stores a private document. Type is validated by declared MIME type and by file signature. */
export async function saveFile(
  tx: Tx, ctx: Ctx | null, file: { name: string; type: string; bytes: Buffer }, kind: FileKind,
  owner: { companyId?: string | null; customerId?: string | null },
): Promise<string> {
  if (file.bytes.length === 0) throw new AppError('FILE_REQUIRED');
  if (file.bytes.length > MAX_UPLOAD_BYTES) throw new AppError('FILE_TOO_LARGE');
  if (!ALLOWED_UPLOAD_TYPES.includes(file.type) || !MAGIC[file.type]?.(file.bytes)) throw new AppError('FILE_TYPE');
  const row = await tx.one<{ id: string }>(
    `insert into file_objects (kind, filename, mime_type, size_bytes, sha256, data, company_id, customer_id, uploaded_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id`,
    [
      kind, file.name.replace(/[^\w.\- ]+/g, '_').slice(0, 150) || 'file', file.type, file.bytes.length,
      createHash('sha256').update(file.bytes).digest('hex'), file.bytes, owner.companyId ?? null, owner.customerId ?? null, ctx?.userId ?? null,
    ],
  );
  return row.id;
}

export async function fileFromForm(value: unknown): Promise<{ name: string; type: string; bytes: Buffer } | null> {
  if (!(value instanceof File) || value.size === 0) return null;
  if (value.size > MAX_UPLOAD_BYTES) throw new AppError('FILE_TOO_LARGE');
  return { name: value.name, type: value.type, bytes: Buffer.from(await value.arrayBuffer()) };
}

/** Reads a document for download. Row-level security decides visibility; every access is logged. */
export async function readFile(ctx: Ctx, id: string): Promise<{ filename: string; mime_type: string; data: Buffer }> {
  return withCtx(ctx, async (tx) => {
    const file = await tx.one<{ filename: string; mime_type: string; data: Buffer }>(
      'select filename, mime_type, data from file_objects where id = $1', [id],
    );
    await tx.exec('insert into file_access_logs (file_id, user_id, ip) values ($1, $2, $3)', [id, ctx.userId, ctx.ip]);
    return file;
  });
}
