import { FlaskConical } from 'lucide-react';
import { getT } from '@/i18n/server';
import { isSandbox } from '@/lib/config';

/** Always-visible label so sandbox data and adapters are never mistaken for real integrations. */
export async function SandboxBanner() {
  if (!isSandbox()) return null;
  const { t } = await getT();
  return (
    <div className="bg-amber-100 text-amber-950" data-testid="sandbox-banner">
      <p className="mx-auto flex max-w-6xl items-start gap-2 px-4 py-1.5 text-xs font-medium">
        <FlaskConical className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        {t('common.sandboxBanner')}
      </p>
    </div>
  );
}
