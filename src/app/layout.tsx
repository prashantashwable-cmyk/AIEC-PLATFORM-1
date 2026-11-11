import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import '@fontsource-variable/inter';
import '@fontsource-variable/noto-sans-devanagari';
import '@fontsource-variable/plus-jakarta-sans';
import '@fontsource-variable/manrope';
import './globals.css';
import { getT } from '@/i18n/server';
import { I18nProvider } from '@/i18n/client';
import { SandboxBanner } from '@/components/sandbox-banner';
import { cookies } from 'next/headers';
import { isSandbox } from '@/lib/config';
import { ALL_THEMES_CSS, DEFAULT_THEME, THEME_COOKIE, isTheme } from '@/lib/themes';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return {
    title: { default: t('common.product'), template: `%s · ${t('common.brand')}` },
    description: t('landing.heroBody'),
    manifest: '/manifest.webmanifest',
  };
}

export const viewport: Viewport = { themeColor: '#6d28d9', width: 'device-width', initialScale: 1 };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const { t, locale } = await getT();
  // The design preview cookie is honoured only in sandbox mode; production always uses the default theme.
  const preview = isSandbox() ? (await cookies()).get(THEME_COOKIE)?.value : undefined;
  const theme = isTheme(preview) ? preview : DEFAULT_THEME;
  return (
    <html lang={locale} data-theme={theme}>
      <head><style dangerouslySetInnerHTML={{ __html: ALL_THEMES_CSS }} /></head>
      <body>
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:rounded focus:bg-surface focus:px-3 focus:py-2">
          {t('common.skipToContent')}
        </a>
        <I18nProvider locale={locale}>
          <SandboxBanner />
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}
