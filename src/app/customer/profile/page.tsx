import Link from 'next/link';
import { dataRequestAction, profileAction } from '@/app/actions/app';
import { Split, enumOptions } from '@/components/common';
import { ActionForm, Field, SelectField, SubmitButton, TextareaField } from '@/components/ui/form';
import { Badge, PageHeader, Section, Table, Td, Th } from '@/components/ui';
import { CUSTOMER_TYPE } from '@/lib/enums';
import { formatDateTime } from '@/lib/format';
import { displayPhone } from '@/lib/phone';
import { load, pageCtx } from '@/server/page';
import { getProfile } from '@/server/services/customer';

export default async function ProfilePage() {
  const { ctx, t, locale } = await pageCtx('customer');
  const { customer, consents } = await load(() => getProfile(ctx));
  return (
    <>
      <PageHeader title={t('nav.profile')} subtitle={t('p.profile.subtitle')} />
      <Split
        main={<>
          <Section title={t('p.profile.details')}>
            <ActionForm action={profileAction} resetOnSuccess={false} className="grid gap-4 sm:grid-cols-2">
              <Field name="name" label={t('f.name')} required defaultValue={customer.name} />
              <Field label={t('f.phone')} value={displayPhone(customer.phone)} readOnly disabled />
              <Field name="email" type="email" label={t('f.email')} defaultValue={customer.email ?? ''} />
              <SelectField name="customerType" label={t('f.customerType')} options={enumOptions(t, 'customerType', CUSTOMER_TYPE)} defaultValue={customer.customer_type} />
              <div><SubmitButton>{t('common.save')}</SubmitButton></div>
            </ActionForm>
          </Section>
          <Section title={t('p.profile.consents')} description={<Link href="/privacy" className="text-brand-700 hover:underline">{t('enquiry.readPrivacy')}</Link>}>
            <Table>
              <thead><tr><Th>{t('f.purpose')}</Th><Th>{t('f.version')}</Th><Th>{t('f.project')}</Th><Th>{t('f.givenOn')}</Th><Th>{t('common.status')}</Th></tr></thead>
              <tbody>{consents.map((c) => (
                <tr key={c.id}><Td>{t(`m.consentPurpose.${c.purpose}`)}</Td><Td>{c.notice_version}</Td><Td>{c.lead_number ?? '—'}</Td><Td>{formatDateTime(c.granted_at, locale)}</Td>
                  <Td>{c.withdrawn_at ? <Badge tone="red">{t('m.withdrawnOn', { date: formatDateTime(c.withdrawn_at, locale) })}</Badge> : <Badge tone="green">{t('f.active')}</Badge>}</Td></tr>
              ))}</tbody>
            </Table>
          </Section>
        </>}
        side={<Section title={t('p.profile.rights')} description={t('p.profile.rightsNote')}>
          <ActionForm action={dataRequestAction} className="space-y-3">
            <SelectField name="kind" label={t('f.requestType')} required options={['ACCESS', 'CORRECTION', 'DELETION', 'WITHDRAW_CONTACT_CONSENT'].map((k) => ({ value: k, label: t(`m.dataRequest.${k}`) }))} />
            <TextareaField name="note" label={t('common.notes')} rows={2} />
            <SubmitButton variant="secondary">{t('common.submit')}</SubmitButton>
          </ActionForm>
        </Section>}
      />
    </>
  );
}
