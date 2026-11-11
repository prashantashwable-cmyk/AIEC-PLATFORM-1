import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import '@fontsource-variable/inter';
import '@fontsource-variable/noto-sans-devanagari';
import './globals.css';
import { getT } from '@/i18n/server';
import { I18nProvider } from '@/i18n/client';
import { SandboxBanner } from '@/components/sandbox-banner';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return {
    title: { default: t('common.product'), template: `%s · ${t('common.brand')}` },
    description: t('landing.heroBody'),
    manifest: '/manifest.webmanifest',
  };
}

export const viewport: Viewport = { themeColor: '#1d3fa3', width: 'device-width', initialScale: 1 };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const { t, locale } = await getT();
  return (
    <html lang={locale}>
      <body>
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:rounded focus:bg-white focus:px-3 focus:py-2">
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
