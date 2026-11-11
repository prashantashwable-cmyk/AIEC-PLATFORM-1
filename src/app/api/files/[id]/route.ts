import { NextResponse } from 'next/server';
import { AppError } from '@/lib/errors';
import { getSessionUser } from '@/server/auth';
import { readFile } from '@/server/services/files';

/** Private document download: session required, row-level security decides access, every read is logged. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getSessionUser();
  if (!ctx) return NextResponse.json({ ok: false, error: { code: 'UNAUTHENTICATED' } }, { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ ok: false, error: { code: 'NOT_FOUND' } }, { status: 404 });
  try {
    const file = await readFile(ctx, id);
    return new NextResponse(new Uint8Array(file.data), {
      headers: {
        'Content-Type': file.mime_type,
        'Content-Disposition': `inline; filename="${file.filename.replace(/"/g, '')}"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    if (error instanceof AppError) return NextResponse.json({ ok: false, error: { code: 'NOT_FOUND' } }, { status: 404 });
    throw error;
  }
}
