'use client';

import { LogOut } from 'lucide-react';
import { logoutAction } from '@/app/actions/public';
import { ActionForm } from '@/components/ui/form';
import { useT } from '@/i18n/client';

export function LogoutButton() {
  const t = useT();
  return (
    <ActionForm action={logoutAction} hideSuccess>
      <button type="submit" data-testid="logout" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-surface px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
        <LogOut className="size-3.5" aria-hidden /> <span className="hidden sm:inline">{t('common.logout')}</span>
      </button>
    </ActionForm>
  );
}
