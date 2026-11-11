'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Languages } from 'lucide-react';
import { LOCALES } from '@/lib/enums';
import { LOCALE_NAMES } from '@/i18n';
import { useI18n } from '@/i18n/client';
import { setLocaleAction } from '@/app/locale-action';
import { cn } from '@/lib/format';

export function LanguageSwitcher() {
  const { locale, t } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-1.5" role="group" aria-label={t('common.language')}>
      <Languages className="size-4 shrink-0 text-slate-500" aria-hidden />
      <div className="flex rounded-lg bg-slate-100 p-0.5">
        {LOCALES.map((code) => (
          <button
            key={code}
            type="button"
            lang={code}
            disabled={pending}
            aria-pressed={code === locale}
            data-testid={`lang-${code}`}
            onClick={() => startTransition(async () => { await setLocaleAction(code); router.refresh(); })}
            className={cn(
              'rounded-md px-2 py-1 text-xs font-medium transition-colors',
              code === locale ? 'bg-surface text-brand-800 shadow-sm' : 'text-slate-600 hover:text-slate-900',
            )}
          >
            {LOCALE_NAMES[code]}
          </button>
        ))}
      </div>
    </div>
  );
}
