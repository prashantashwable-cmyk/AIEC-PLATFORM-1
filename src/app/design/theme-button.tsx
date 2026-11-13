'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setThemeAction } from '@/app/locale-action';

export function ThemeButton({ id, label, active }: { id: string; label: string; active: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button type="button" disabled={pending || active} data-testid={`theme-${id}`}
      onClick={() => start(async () => { await setThemeAction(id); router.refresh(); })}
      className="rounded-full bg-brand-600 px-4 py-1.5 text-sm font-semibold text-on-brand hover:bg-brand-700 disabled:opacity-60">
      {label}
    </button>
  );
}
