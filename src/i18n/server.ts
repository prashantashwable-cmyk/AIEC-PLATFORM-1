import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import type { Locale } from '@/lib/enums';
import { DEFAULT_LOCALE, LOCALE_COOKIE, createT, isLocale, type TFunction } from './index';

export const getLocale = cache(async (): Promise<Locale> => {
  const value = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : DEFAULT_LOCALE;
});

/** Server-side translator for the visitor's selected language. */
export async function getT(): Promise<{ t: TFunction; locale: Locale }> {
  const locale = await getLocale();
  return { t: createT(locale), locale };
}
