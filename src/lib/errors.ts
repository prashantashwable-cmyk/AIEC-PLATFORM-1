import type { TParams } from '@/i18n';

/** Expected, user-facing failure. `code` maps to the `err.<code>` translation key. */
export class AppError extends Error {
  constructor(
    public readonly code: string,
    public readonly params?: TParams,
    public readonly fieldErrors?: Record<string, string>,
  ) {
    super(code);
    this.name = 'AppError';
  }
}

export function fail(code: string, params?: TParams): never {
  throw new AppError(code, params);
}
