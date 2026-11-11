import { getT } from '@/i18n/server';
import { LinkButton } from '@/components/ui';

export default async function NotFound() {
  const { t } = await getT();
  return (
    <main id="main" className="mx-auto flex min-h-[70vh] max-w-lg flex-col items-center justify-center px-4 text-center">
      <p className="text-5xl font-bold text-brand-700">404</p>
      <h1 className="mt-4 text-xl font-semibold">{t('common.notFoundTitle')}</h1>
      <p className="mt-2 text-sm text-slate-600">{t('common.notFoundBody')}</p>
      <LinkButton href="/" className="mt-6">{t('common.goHome')}</LinkButton>
    </main>
  );
}
