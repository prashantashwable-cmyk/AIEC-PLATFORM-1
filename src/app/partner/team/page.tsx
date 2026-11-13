import { addTeamMemberAction, removeTeamMemberAction } from '@/app/actions/app';
import { Split } from '@/components/common';
import { ActionForm, Field, SelectField, SubmitButton } from '@/components/ui/form';
import { PageHeader, Section, Table, Td, Th } from '@/components/ui';
import { displayPhone } from '@/lib/phone';
import { load, pageCtx } from '@/server/page';
import { getCompanyProfile } from '@/server/services/partners';

export default async function TeamPage() {
  const { ctx, t } = await pageCtx('partner');
  const { team } = await load(() => getCompanyProfile(ctx));
  const manage = ctx.permissions.has('team.manage');
  return (
    <>
      <PageHeader title={t('nav.team')} subtitle={t('p.team.subtitle')} />
      <Split
        main={<Section>
          <Table>
            <thead><tr><Th>{t('f.name')}</Th><Th>{t('f.phone')}</Th><Th>{t('f.role')}</Th>{manage && <Th />}</tr></thead>
            <tbody>{team.map((m) => (
              <tr key={`${m.id}-${m.role_code}`}><Td>{m.full_name}</Td><Td>{displayPhone(m.phone)}</Td><Td>{t(`e.role.${m.role_code}`)}</Td>
                {manage && <Td>{['PARTNER_SUPERVISOR', 'TECHNICIAN'].includes(m.role_code) && (
                  <ActionForm action={removeTeamMemberAction} hideSuccess><input type="hidden" name="userId" value={m.id} /><input type="hidden" name="role" value={m.role_code} />
                    <SubmitButton size="sm" variant="secondary" confirm={t('m.confirmRevoke')}>{t('a.remove')}</SubmitButton></ActionForm>
                )}</Td>}
              </tr>
            ))}</tbody>
          </Table>
        </Section>}
        side={manage ? (
          <Section title={t('a.addTeamMember')} description={t('p.team.addNote')}>
            <ActionForm action={addTeamMemberAction} className="space-y-3">
              <Field name="name" label={t('f.name')} required /><Field name="phone" type="tel" label={t('f.phone')} required hint={t('auth.phoneHint')} />
              <SelectField name="role" label={t('f.role')} required options={['TECHNICIAN', 'PARTNER_SUPERVISOR'].map((r) => ({ value: r, label: t(`e.role.${r}`) }))} />
              <SubmitButton>{t('common.add')}</SubmitButton>
            </ActionForm>
          </Section>
        ) : <span />}
      />
    </>
  );
}
