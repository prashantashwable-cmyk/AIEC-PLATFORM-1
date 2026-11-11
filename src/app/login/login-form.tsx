'use client';

import { useState } from 'react';
import { demoLoginAction, requestOtpAction, verifyOtpAction } from '@/app/actions/public';
import { ActionForm, Field, SubmitButton } from '@/components/ui/form';
import { Alert, Badge, Button } from '@/components/ui';
import { useT } from '@/i18n/client';

type DemoUser = { id: string; full_name: string; roles: string[]; company: string | null };

export function LoginForm({ demoUsers }: { demoUsers: DemoUser[] }) {
  const t = useT();
  const [challenge, setChallenge] = useState<{ phone: string; code: string | null } | null>(null);

  return (
    <div className="space-y-6">
      {!challenge ? (
        <ActionForm action={requestOtpAction} hideSuccess resetOnSuccess={false} className="space-y-4"
          onSuccess={(r) => setChallenge({ phone: String(r.params?.phone ?? ''), code: r.params?.code ? String(r.params.code) : null })}>
          <Field name="phone" label={t('auth.phone')} type="tel" inputMode="numeric" autoComplete="tel" required hint={t('auth.phoneHint')} data-testid="login-phone" />
          <SubmitButton className="w-full" data-testid="login-send">{t('auth.sendOtp')}</SubmitButton>
          <p className="text-xs text-slate-500">{t('auth.newHere')}</p>
        </ActionForm>
      ) : (
        <ActionForm action={verifyOtpAction} resetOnSuccess={false} className="space-y-4">
          {challenge.code && <div data-testid="sandbox-otp" data-code={challenge.code}><Alert tone="amber">{t('auth.sandboxOtp', { code: challenge.code })}</Alert></div>}
          <input type="hidden" name="phone" value={challenge.phone} />
          <Field name="code" label={t('auth.otp')} inputMode="numeric" autoComplete="one-time-code" maxLength={6} required
            hint={t('auth.otpHint', { phone: challenge.phone })} data-testid="login-code" />
          <Field name="name" label={t('auth.name')} autoComplete="name" hint={t('auth.nameHint')} data-testid="login-name" />
          <SubmitButton className="w-full" data-testid="login-verify">{t('auth.verify')}</SubmitButton>
          <Button type="button" variant="ghost" size="sm" className="w-full" onClick={() => setChallenge(null)}>{t('auth.changePhone')}</Button>
        </ActionForm>
      )}

      {demoUsers.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-950">{t('auth.demoTitle')}</p>
          <p className="mt-1 text-xs text-amber-900">{t('auth.demoBody')}</p>
          <ul className="mt-3 space-y-2">
            {demoUsers.map((u) => (
              <li key={u.id}>
                <ActionForm action={demoLoginAction} hideSuccess>
                  <input type="hidden" name="userId" value={u.id} />
                  <button type="submit" data-testid={`demo-${u.roles[0]}`}
                    className="flex w-full flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-white px-3 py-2 text-left text-sm hover:border-brand-400">
                    <span className="font-medium text-slate-900">{u.full_name}{u.company ? <span className="font-normal text-slate-500"> · {u.company}</span> : null}</span>
                    <span className="flex flex-wrap gap-1">{u.roles.map((r) => <Badge key={r} tone="blue">{t(`e.role.${r}`)}</Badge>)}</span>
                  </button>
                </ActionForm>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
