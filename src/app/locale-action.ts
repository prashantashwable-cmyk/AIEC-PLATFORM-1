'use server';

import { cookies } from 'next/headers';
import { LOCALE_COOKIE, isLocale } from '@/i18n';

export async function setLocaleAction(locale: string): Promise<void> {
  if (!isLocale(locale)) return;
  (await cookies()).set(LOCALE_COOKIE, locale, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' });
}

export async function setThemeAction(theme: string): Promise<void> {
  const { isSandbox } = await import('@/lib/config');
  const { THEME_COOKIE, isTheme } = await import('@/lib/themes');
  if (!isSandbox() || !isTheme(theme)) return;
  (await cookies()).set(THEME_COOKIE, theme, { path: '/', maxAge: 60 * 60 * 24 * 30, sameSite: 'lax' });
}
