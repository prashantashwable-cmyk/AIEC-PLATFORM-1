import { createStaffAction, permissionAction, staffRoleAction, userActiveAction, userZonesAction } from '@/app/actions/app';
import { enumOptions } from '@/components/common';
import { ActionForm, Field, SelectField, SubmitButton } from '@/components/ui/form';
import { Alert, Badge, PageHeader, Section, Table, Tabs, Td, Th } from '@/components/ui';
import { INTERNAL_ROLES, type Role } from '@/lib/enums';
import { displayPhone } from '@/lib/phone';
import { load, pageCtx, readParams, type SearchParams } from '@/server/page';
import { getUsersOverview } from '@/server/services/admin';

export default async function UsersPage({ searchParams }: { searchParams: SearchParams }) {
  const { ctx, t } = await pageCtx('admin');
  const sp = await readParams(searchParams);
  const d = await load(() => getUsersOverview(ctx));
  const tab = sp.tab === 'permissions' ? 'permissions' : 'users';
  const granted = new Set(d.matrix.map((m) => `${m.role_code}:${m.permission_code}`));
  return (
    <>
      <PageHeader title={t('nav.users')} subtitle={t('p.users.subtitle')} />
      <Tabs active={tab} tabs={[{ key: 'users', label: t('p.users.staff'), href: '/admin/users', count: d.users.length }, { key: 'permissions', label: t('p.users.matrix'), href: '/admin/users?tab=permissions' }]} />
      {tab === 'users' && (
        <div className="space-y-5">
          <Section title={t('a.addStaff')} description={t('p.users.addNote')}>
            <ActionForm action={createStaffAction} className="grid gap-3 sm:grid-cols-4">
              <Field name="name" label={t('f.name')} required /><Field name="phone" label={t('f.phone')} type="tel" required />
              <SelectField name="role" label={t('f.role')} required options={enumOptions(t, 'role', INTERNAL_ROLES)} />
              <div className="self-end"><SubmitButton>{t('common.add')}</SubmitButton></div>
            </ActionForm>
          </Section>
          <Section>
            <Table>
              <thead><tr><Th>{t('f.name')}</Th><Th>{t('f.role')}</Th><Th>{t('f.zones')}</Th><Th>{t('common.status')}</Th><Th>{t('common.actions')}</Th></tr></thead>
              <tbody>{d.users.map((u) => {
                const roles = u.roles as Array<{ id: string; role: Role; company: string | null }>;
                const self = u.id === ctx.userId;
                return (
                  <tr key={u.id}>
                    <Td><span className="font-medium">{u.full_name}</span><span className="block text-xs text-slate-500">{displayPhone(u.phone)}</span></Td>
                    <Td><div className="flex flex-wrap gap-1.5">{roles.map((r) => (
                      <span key={r.id} className="inline-flex items-center gap-1">
                        <Badge tone="blue">{t(`e.role.${r.role}`)}{r.company ? ` · ${r.company}` : ''}</Badge>
                        {!self && (INTERNAL_ROLES as readonly string[]).includes(r.role) && (
                          <ActionForm action={staffRoleAction} hideSuccess><input type="hidden" name="userId" value={u.id} /><input type="hidden" name="role" value={r.role} /><input type="hidden" name="grant" value="no" />
                            <SubmitButton size="sm" variant="ghost" confirm={t('m.confirmRevoke')} aria-label={t('a.revoke')} className="px-1.5 py-0.5 text-xs">✕</SubmitButton></ActionForm>
                        )}
                      </span>
                    ))}</div>
                      {!self && (
                        <ActionForm action={staffRoleAction} hideSuccess className="mt-2 flex items-end gap-1.5">
                          <input type="hidden" name="userId" value={u.id} /><input type="hidden" name="grant" value="yes" />
                          <SelectField name="role" aria-label={t('f.role')} options={enumOptions(t, 'role', INTERNAL_ROLES)} />
                          <SubmitButton size="sm" variant="secondary">{t('a.grant')}</SubmitButton>
                        </ActionForm>
                      )}</Td>
                    <Td>
                      <ActionForm action={userZonesAction} hideSuccess resetOnSuccess={false} className="flex max-w-xs flex-col gap-1.5">
                        <input type="hidden" name="userId" value={u.id} />
                        <div className="flex flex-wrap gap-x-3 gap-y-1">{d.zones.map((z) => (
                          <label key={z.id} className="flex items-center gap-1 text-xs"><input type="checkbox" name="zoneIds[]" value={z.id} defaultChecked={(u.zones as string[]).includes(z.code)} className="size-3.5 accent-brand-600" />{t(`zone.${z.code}`)}</label>
                        ))}</div>
                        <div><SubmitButton size="sm" variant="secondary">{t('common.save')}</SubmitButton></div>
                      </ActionForm>
                    </Td>
                    <Td><Badge tone={u.is_active ? 'green' : 'red'}>{u.is_active ? t('f.active') : t('m.inactive')}</Badge></Td>
                    <Td>{!self && (
                      <ActionForm action={userActiveAction} hideSuccess><input type="hidden" name="userId" value={u.id} /><input type="hidden" name="active" value={u.is_active ? 'no' : 'yes'} />
                        <SubmitButton size="sm" variant={u.is_active ? 'danger' : 'secondary'} confirm={u.is_active ? t('m.confirmDeactivate') : undefined}>{u.is_active ? t('a.deactivate') : t('a.activate')}</SubmitButton></ActionForm>
                    )}</Td>
                  </tr>
                );
              })}</tbody>
            </Table>
          </Section>
        </div>
      )}
      {tab === 'permissions' && (
        <>
          <Alert tone="blue" className="mb-4">{t('p.users.matrixNote')}</Alert>
          <Section>
            <div className="overflow-x-auto">
              <table className="min-w-max border-collapse text-xs">
                <thead><tr><th className="sticky left-0 bg-surface px-2 py-2 text-left">{t('f.permission')}</th>{d.roles.map((r) => <th key={r} className="px-1.5 py-2 text-left align-bottom font-medium text-slate-600"><span className="block w-20 leading-tight">{t(`e.role.${r}`)}</span></th>)}</tr></thead>
                <tbody>{d.permissions.map((perm) => (
                  <tr key={perm} className="border-t border-slate-100">
                    <td className="sticky left-0 bg-surface px-2 py-1 font-mono">{perm}</td>
                    {d.roles.map((role) => {
                      const on = granted.has(`${role}:${perm}`);
                      return (
                        <td key={role} className="px-1.5 py-1 text-center">
                          <ActionForm action={permissionAction} hideSuccess>
                            <input type="hidden" name="role" value={role} /><input type="hidden" name="permission" value={perm} /><input type="hidden" name="grant" value={on ? 'no' : 'yes'} />
                            <button type="submit" aria-label={`${role} ${perm}`} aria-pressed={on}
                              className={on ? 'size-5 rounded bg-brand-600 text-on-brand' : 'size-5 rounded border border-slate-300 text-transparent hover:border-brand-400'}>✓</button>
                          </ActionForm>
                        </td>
                      );
                    })}
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </Section>
        </>
      )}
    </>
  );
}
