import { publishRuleAction, settingAction, zoneAction } from '@/app/actions/app';
import { ActionForm, Field, SubmitButton } from '@/components/ui/form';
import { Alert, Badge, PageHeader, Section, Table, Td, Th } from '@/components/ui';
import { formatDateTime } from '@/lib/format';
import { load, pageCtx } from '@/server/page';
import { getSettings } from '@/server/services/admin';

export default async function SettingsPage() {
  const { ctx, t, locale } = await pageCtx('admin');
  const d = await load(() => getSettings(ctx));
  const rule = d.rules.find((r) => r.is_active) ?? d.rules[0];
  const weights = ['compliance', 'capability', 'capacity', 'performance', 'price', 'response'] as const;
  return (
    <>
      <PageHeader title={t('nav.settings')} subtitle={t('p.settings.subtitle')} />
      <div className="grid gap-5 xl:grid-cols-2">
        <Section title={t('p.settings.operations')}>
          <ul className="space-y-3">{d.settings.map((s) => (
            <li key={s.key}>
              <ActionForm action={settingAction} hideSuccess resetOnSuccess={false} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="key" value={s.key} />
                <Field name="value" label={t(`set.${s.key}`)} defaultValue={s.value} wrapperClassName="min-w-56 flex-1" hint={s.key === 'holidays' ? t('set.holidaysHint') : s.key === 'commission_invoice_gst_percent' ? t('p.commission.gstNote') : undefined} />
                <SubmitButton size="sm" variant="secondary">{t('common.save')}</SubmitButton>
              </ActionForm>
            </li>
          ))}</ul>
        </Section>

        <div className="space-y-5">
          <Section title={t('p.settings.zones')} description={t('landing.areasBody')}>
            <Table className="min-w-0">
              <thead><tr><Th>{t('f.zone')}</Th><Th>{t('p.dashboard.activePartners')}</Th><Th>{t('common.status')}</Th><Th /></tr></thead>
              <tbody>{d.zones.map((z) => (
                <tr key={z.id}><Td>{t(`zone.${z.code}`)}</Td><Td>{z.active_partners}</Td><Td><Badge tone={z.is_active ? 'green' : 'gray'}>{z.is_active ? t('f.active') : t('m.inactive')}</Badge></Td>
                  <Td><ActionForm action={zoneAction} hideSuccess><input type="hidden" name="id" value={z.id} />{!z.is_active && <input type="hidden" name="active" value="true" />}
                    <SubmitButton size="sm" variant="secondary">{z.is_active ? t('a.deactivate') : t('a.activate')}</SubmitButton></ActionForm></Td></tr>
              ))}</tbody>
            </Table>
          </Section>

          <Section title={t('p.settings.matching')} description={t('p.settings.matchingNote', { version: rule?.version ?? 1 })}>
            <ActionForm action={publishRuleAction} resetOnSuccess={false} className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {weights.map((w) => <Field key={w} name={w} type="number" min={0} max={100} label={t(`p.settings.w.${w}`)} defaultValue={rule?.[`w_${w}`] ?? 0} required />)}
              <div className="col-span-full"><SubmitButton variant="secondary" confirm={t('m.confirmPolicy')}>{t('a.publishNewVersion')}</SubmitButton></div>
            </ActionForm>
          </Section>
        </div>

        <Section title={t('p.settings.outbound')} className="xl:col-span-2">
          <Alert tone="amber" className="mb-3">{t('p.settings.outboundNote')}</Alert>
          <Table>
            <thead><tr><Th>{t('f.when')}</Th><Th>{t('f.channel')}</Th><Th>{t('f.template')}</Th><Th>{t('common.status')}</Th></tr></thead>
            <tbody>{d.messages.map((m) => (
              <tr key={m.id}><Td>{formatDateTime(m.created_at, locale)}</Td><Td>{m.channel}</Td><Td className="font-mono text-xs">{m.template}</Td><Td><Badge tone="amber">{t('m.sandboxNotSent')}</Badge></Td></tr>
            ))}</tbody>
          </Table>
        </Section>
      </div>
    </>
  );
}
