import { LOCALES, type Locale } from '@/lib/enums';
import { en } from './messages/en';
import { hi } from './messages/hi';
import { mr } from './messages/mr';

type Deep<T> = { [K in keyof T]: T[K] extends string ? string : Deep<T[K]> };
/** Every locale must provide exactly the same keys as English (enforced by the compiler). */
export type Messages = Deep<typeof en>;

export const DEFAULT_LOCALE: Locale = 'en';
export const LOCALE_COOKIE = 'aiec_locale';
export const LOCALE_NAMES: Record<Locale, string> = { en: 'English', hi: 'हिन्दी', mr: 'मराठी' };

const dictionaries: Record<Locale, Messages> = { en, hi, mr };

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

export function getMessages(locale: Locale): Messages {
  return dictionaries[locale] ?? dictionaries[DEFAULT_LOCALE];
}

export type TParams = Record<string, string | number | null | undefined>;
export type TFunction = (key: string, params?: TParams) => string;

function lookup(messages: unknown, key: string): string | undefined {
  let node: unknown = messages;
  for (const part of key.split('.')) {
    if (node && typeof node === 'object' && part in (node as Record<string, unknown>)) {
      node = (node as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return typeof node === 'string' ? node : undefined;
}

/** Translator with English fallback; unknown keys return the key so gaps are visible, never blank. */
export function createT(locale: Locale): TFunction {
  const messages = getMessages(locale);
  return (key, params) => {
    let text = lookup(messages, key) ?? lookup(en, key) ?? key;
    if (params) {
      for (const [name, value] of Object.entries(params)) {
        text = text.replaceAll(`{${name}}`, value === null || value === undefined ? '' : String(value));
      }
    }
    return text;
  };
}

export function hasMessage(key: string): boolean {
  return lookup(en, key) !== undefined;
}
