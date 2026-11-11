'use client';

import { useT } from '@/i18n/client';
import { Button } from '@/components/ui';

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useT();
  return (
    <main id="main" className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-4 text-center">
      <h1 className="text-xl font-semibold">{t('common.errorTitle')}</h1>
      <p className="mt-2 text-sm text-slate-600">{t('common.errorBody')}</p>
      <Button onClick={() => reset()} className="mt-6">{t('common.retry')}</Button>
    </main>
  );
}
