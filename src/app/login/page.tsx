import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getT } from '@/i18n/server';
import { LanguageSwitcher } from '@/components/language-switcher';
import { Logo } from '@/components/logo';
import { Card } from '@/components/ui';
import { getSessionUser } from '@/server/auth';
import { listDemoUsers } from '@/server/authcore';
import { LoginForm } from './login-form';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t('common.login') };
}

export default async function LoginPage() {
  if (await getSessionUser()) redirect('/app');
  const { t } = await getT();
  const demoUsers = await listDemoUsers();
  return (
    <main id="main" className="mx-auto flex min-h-screen max-w-md flex-col px-4 py-8">
      <div className="flex items-center justify-between gap-3">
        <Link href="/"><Logo tagline={t('common.brandFull')} /></Link>
        <LanguageSwitcher />
      </div>
      <Card className="mt-8 p-6">
        <h1 className="text-xl font-semibold text-slate-900">{t('auth.title')}</h1>
        <p className="mt-1 mb-5 text-sm text-slate-600">{t('auth.subtitle')}</p>
        <LoginForm demoUsers={demoUsers} />
      </Card>
      <p className="mt-6 text-center text-xs text-slate-500"><Link href="/privacy" className="hover:underline">{t('footer.privacy')}</Link></p>
    </main>
  );
}
