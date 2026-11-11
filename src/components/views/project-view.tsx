import Link from 'next/link';
import {
  assignTeamAction, complianceDecisionAction, complianceDocAction, createTaskAction, materialAction, materialStatusAction, milestoneAction, projectStatusAction,
  readinessAction, reviewTaskAction, workEvidenceAction,
} from '@/app/actions/app';
import { Check, FileLink, Split, Timeline, enumOptions } from '@/components/common';
import { ActionForm, CheckboxField, Field, SelectField, SubmitButton, TextareaField } from '@/components/ui/form';
import { Alert, Badge, DataList, EmptyState, Section, StatusBadge, Table, Tabs, Td, Th } from '@/components/ui';
import type { TFunction } from '@/i18n';
import { COMPLIANCE_DOC_TYPE, MATERIAL_STATUS, MILESTONE_STATUS, type Locale } from '@/lib/enums';
import { formatDate, formatDateTime, formatINR } from '@/lib/format';
import { displayPhone } from '@/lib/phone';
import type { Ctx } from '@/server/ctx';
import type { getProject } from '@/server/services/projects';

type Data = Awaited<ReturnType<typeof getProject>>;
const TABS = ['overview', 'tasks', 'milestones', 'evidence', 'materials', 'documents', 'site'] as const;

/** Project workspace shared by AIEC staff and the partner company; controls shown depend on role. */
export function ProjectView({ ctx, t, locale, data, mode, tab, base }: { ctx: Ctx; t: TFunction; locale: Locale; data: Data; mode: 'staff' | 'partner'; tab: string; base: string }) {
  const { project: p, milestones, tasks, team, evidence, materials, documents, events, defects, attendance, checklists, warranty, members, suppliers, startMissing, handoverMissing } = data;
  const can = (perm: string) => ctx.permissions.has(perm);
  const staff = mode === 'staff';
  const lead = !staff && can('project.assign');
  const active = (TABS as readonly string[]).includes(tab) ? tab : 'overview';
  const closed = ['HANDED_OVER', 'CLOSED', 'CANCELLED'].includes(p.status);
  const memberOptions = members.map((m) => ({ value: m.id, label: m.full_name }));
  const openDefects = defects.filter((d) => d.status !== 'CLOSED').length;

  const statusOptions: string[] = [];
  if (p.status === 'PLANNING' && (lead || (staff && can('project.manage')))) statusOptions.push('IN_PROGRESS');
  if (p.status === 'IN_PROGRESS' && (lead || staff)) statusOptions.push('QC');
  if (p.status === 'QC' && staff && (can('qc.review') || can('project.manage'))) statusOptions.push('HANDOVER_PENDING');
  if (p.status === 'HANDOVER_PENDING' && staff && can('project.manage')) statusOptions.push('HANDED_OVER');
  if (p.status === 'HANDED_OVER' && staff && can('project.manage')) statusOptions.push('CLOSED');
  if (!closed && !['ON_HOLD', 'STOP_WORK'].includes(p.status) && (lead || staff)) statusOptions.push('ON_HOLD');
  if (!closed && p.status !== 'STOP_WORK') statusOptions.push('STOP_WORK');
  if ((p.status === 'ON_HOLD' && (lead || staff)) || (p.status === 'STOP_WORK' && staff && (can('incident.manage') || can('project.manage')))) statusOptions.push('RESUME');
  if (!closed && staff && can('project.manage')) statusOptions.push('CANCELLED');
  const statusLabel = (v: string) => (v === 'RESUME' ? t('a.resume') : t(`e.projectStatus.${v}`));

  return (
    <>
      {p.status === 'STOP_WORK' && <Alert tone="red" className="mb-4" title={t('e.projectStatus.STOP_WORK')}>{p.status_reason} — {t('m.stopWorkNote')}</Alert>}
      <Tabs active={active} tabs={TABS.map((key) => ({
        key, label: t(`p.project.tab.${key}`), href: key === 'overview' ? base : `${base}?tab=${key}`,
        count: key === 'tasks' ? tasks.length : key === 'evidence' ? evidence.length : key === 'documents' ? documents.length : undefined,
      }))} />

      {active === 'overview' && (
        <Split
          main={<>
            <Section title={t('p.project.summary')} actions={<StatusBadge value={p.status} label={t(`e.projectStatus.${p.status}`)} />}>
              <DataList columns={3} items={[
                { label: t('f.project'), value: `${p.project_name} · ${p.lead_number}` }, { label: t('f.address'), value: `${p.address} (${t(`zone.${p.zone_code}`)})` },
                { label: t('f.customer'), value: `${p.customer_name} · ${displayPhone(p.customer_phone)}` }, { label: t('f.partner'), value: p.legal_name },
                { label: t('f.order'), value: p.order_number ? <Link className="text-brand-700 hover:underline" href={`/${staff ? 'admin' : 'partner'}/orders/${p.order_id}`}>{p.order_number}</Link> : '—' },
                { label: t('f.supervisor'), value: p.supervisor_name ?? '—' },
                { label: t('f.plannedStart'), value: formatDate(p.planned_start, locale) }, { label: t('f.plannedEnd'), value: formatDate(p.planned_end, locale) },
                { label: t('f.startedAt'), value: formatDateTime(p.started_at, locale) }, { label: t('f.handedOverAt'), value: formatDateTime(p.handed_over_at, locale) },
                { label: t('f.warranty'), value: warranty ? `${formatDate(warranty.starts_on, locale)} – ${formatDate(warranty.ends_on, locale)}` : '—' },
              ]} />
            </Section>

            <Section title={t('p.project.gates')} description={t('p.project.gatesNote')}>
              <ul className="space-y-1.5">
                <Check ok={p.site_ready} label={t('f.siteReady')} />
                <Check ok={p.permissions_confirmed} label={t('f.permissionsConfirmed')} hint={t('m.permissionsByAiec')} />
                <Check ok={startMissing.length === 0} label={t('p.project.startDocs')} hint={startMissing.map((d) => t(`e.complianceDocType.${d}`)).join(', ') || undefined} />
                <Check ok={handoverMissing.length === 0} label={t('p.project.handoverDocs')} hint={handoverMissing.map((d) => t(`e.complianceDocType.${d}`)).join(', ') || undefined} />
                <Check ok={openDefects === 0} label={t('p.project.noOpenDefects')} hint={openDefects ? t('m.openDefectsN', { count: openDefects }) : undefined} />
              </ul>
              {(lead || (staff && (can('project.manage') || can('compliance.document.approve')))) && !closed && (
                <ActionForm action={readinessAction} resetOnSuccess={false} className="mt-4 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2">
                  <input type="hidden" name="id" value={p.id} />
                  <CheckboxField name="siteReady" label={t('f.siteReady')} defaultChecked={p.site_ready} />
                  {staff ? <CheckboxField name="permissionsConfirmed" label={t('f.permissionsConfirmed')} defaultChecked={p.permissions_confirmed} /> : <span />}
                  <Field name="plannedStart" type="date" label={t('f.plannedStart')} defaultValue={p.planned_start ?? ''} />
                  <Field name="plannedEnd" type="date" label={t('f.plannedEnd')} defaultValue={p.planned_end ?? ''} />
                  <div><SubmitButton variant="secondary">{t('common.save')}</SubmitButton></div>
                </ActionForm>
              )}
            </Section>

            {defects.length > 0 && (
              <Section title={t('p.project.defects')} description={t('m.qcNotStatutory')}>
                <ul className="space-y-2 text-sm">{defects.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-start justify-between gap-2"><span>{d.description}</span>
                    <span className="flex gap-1"><StatusBadge value={d.severity} label={t(`e.severity.${d.severity}`)} /><StatusBadge value={d.status} label={t(`e.defectStatus.${d.status}`)} /></span></li>
                ))}</ul>
              </Section>
            )}
          </>}
          side={<>
            {statusOptions.length > 0 && (
              <Section title={t('a.changeStatus')}>
                <ActionForm action={projectStatusAction} className="space-y-3">
                  <input type="hidden" name="id" value={p.id} />
                  <SelectField name="to" label={t('f.newStatus')} required placeholder={t('common.select')} options={statusOptions.map((v) => ({ value: v, label: statusLabel(v) }))} />
                  <TextareaField name="reason" label={t('f.reason')} rows={2} hint={t('m.reasonForHold')} />
                  <SubmitButton confirm={t('m.confirmStatusChange')}>{t('a.changeStatus')}</SubmitButton>
                </ActionForm>
              </Section>
            )}
            <Section title={t('p.project.team')}>
              {team.length === 0 ? <EmptyState title={t('common.noData')} /> : <ul className="space-y-1 text-sm">{team.map((m) => <li key={m.user_id}>{m.full_name}</li>)}</ul>}
              {lead && !closed && memberOptions.length > 0 && (
                <ActionForm action={assignTeamAction} className="mt-3 space-y-3 border-t border-slate-100 pt-3">
                  <input type="hidden" name="projectId" value={p.id} />
                  <SelectField name="userId" label={t('f.teamMember')} required placeholder={t('common.select')} options={memberOptions} />
                  <SubmitButton variant="secondary" size="sm">{t('a.addToProject')}</SubmitButton>
                </ActionForm>
              )}
            </Section>
            <Section title={t('p.lead.history')}>
              <Timeline items={events.map((e) => ({ key: e.id, title: t(`e.projectStatus.${e.to_status}`), meta: `${formatDateTime(e.created_at, locale)} · ${e.actor ?? t('common.system')}`, body: e.reason ?? undefined }))} />
            </Section>
          </>}
        />
      )}

      {active === 'tasks' && (
        <Split
          main={<Section title={t('p.project.tab.tasks')} description={t('m.taskCompletionNote')}>
            {tasks.length === 0 ? <EmptyState title={t('common.noData')} /> : (
              <Table>
                <thead><tr><Th>{t('f.task')}</Th><Th>{t('f.assignedTo')}</Th><Th>{t('f.dueDate')}</Th><Th>{t('common.status')}</Th>{lead && <Th>{t('f.review')}</Th>}</tr></thead>
                <tbody>{tasks.map((k) => (
                  <tr key={k.id}>
                    <Td>{k.title}{k.safety_critical && <Badge tone="red" className="ml-1">{t('f.safetyCritical')}</Badge>}
                      {k.progress_note && <span className="block text-xs text-slate-500">{k.progress_note}</span>}{k.review_note && <span className="block text-xs text-amber-700">{k.review_note}</span>}</Td>
                    <Td>{k.assignee ?? '—'}</Td><Td>{formatDate(k.due_date, locale)}</Td>
                    <Td><StatusBadge value={k.status} label={t(`e.taskStatus.${k.status}`)} /></Td>
                    {lead && <Td>{k.status === 'DONE_PENDING_REVIEW' && (
                      <ActionForm action={reviewTaskAction} hideSuccess className="flex min-w-44 flex-col gap-1.5">
                        <input type="hidden" name="id" value={k.id} />
                        <Field name="note" placeholder={t('f.reviewNote')} aria-label={t('f.reviewNote')} />
                        <div className="flex gap-1.5"><SubmitButton size="sm" variant="success" name="decision" value="approve">{t('a.approve')}</SubmitButton>
                          <SubmitButton size="sm" variant="secondary" name="decision" value="rework">{t('a.requestRework')}</SubmitButton></div>
                      </ActionForm>
                    )}</Td>}
                  </tr>
                ))}</tbody>
              </Table>
            )}
          </Section>}
          side={lead && !closed ? (
            <Section title={t('a.newTask')}>
              <ActionForm action={createTaskAction} className="space-y-3">
                <input type="hidden" name="projectId" value={p.id} />
                <Field name="title" label={t('f.task')} required />
                <TextareaField name="description" label={t('f.description')} rows={2} />
                <SelectField name="assignedTo" label={t('f.assignedTo')} required placeholder={t('common.select')} options={memberOptions} />
                <Field name="dueDate" type="date" label={t('f.dueDate')} />
                <CheckboxField name="safetyCritical" label={t('f.safetyCritical')} />
                <SubmitButton>{t('common.add')}</SubmitButton>
              </ActionForm>
            </Section>
          ) : <span />}
        />
      )}

      {active === 'milestones' && (
        <Section title={t('f.paymentMilestones')} description={t('m.milestonesNote')}>
          <Table>
            <thead><tr><Th>#</Th><Th>{t('f.milestone')}</Th><Th>%</Th><Th>{t('f.amount')}</Th><Th>{t('f.dueDate')}</Th><Th>{t('common.status')}</Th>{lead && can('milestone.update') && <Th>{t('common.actions')}</Th>}</tr></thead>
            <tbody>{milestones.map((m) => (
              <tr key={m.id}>
                <Td>{m.seq}</Td><Td>{m.name}{m.note && <span className="block text-xs text-slate-500">{m.note}</span>}</Td><Td>{Number(m.percent)}%</Td>
                <Td>{formatINR(m.amount_due, locale)}</Td><Td>{formatDate(m.due_date, locale)}</Td><Td><StatusBadge value={m.status} label={t(`e.milestoneStatus.${m.status}`)} /></Td>
                {lead && can('milestone.update') && <Td>{!closed && (
                  <ActionForm action={milestoneAction} hideSuccess resetOnSuccess={false} className="flex flex-wrap items-end gap-1.5">
                    <input type="hidden" name="id" value={m.id} />
                    <SelectField name="status" aria-label={t('common.status')} defaultValue={m.status} options={enumOptions(t, 'milestoneStatus', MILESTONE_STATUS)} />
                    <Field name="dueDate" type="date" aria-label={t('f.dueDate')} defaultValue={m.due_date ?? ''} />
                    <SubmitButton size="sm" variant="secondary">{t('common.save')}</SubmitButton>
                  </ActionForm>
                )}</Td>}
              </tr>
            ))}</tbody>
          </Table>
        </Section>
      )}

      {active === 'evidence' && (
        <Split
          main={<Section title={t('p.project.tab.evidence')} description={t('p.survey.evidenceNote')}>
            {evidence.length === 0 ? <EmptyState title={t('common.noData')} /> : (
              <ul className="grid gap-3 sm:grid-cols-2">{evidence.map((e) => (
                <li key={e.id} className="rounded-lg border border-slate-200 p-3 text-sm">
                  <FileLink id={e.file_id} label={e.caption || t('f.photo')} />
                  <p className="mt-1 text-xs text-slate-500">{e.uploader} · {t('f.deviceTime')}: {formatDateTime(e.captured_at_device, locale)} · {t('f.serverTime')}: {formatDateTime(e.received_at, locale)}</p>
                </li>
              ))}</ul>
            )}
          </Section>}
          side={!staff && can('evidence.submit') && !closed ? (
            <Section title={t('a.addEvidence')}>
              <ActionForm action={workEvidenceAction} className="space-y-3">
                <input type="hidden" name="projectId" value={p.id} />
                <Field name="file" type="file" accept="image/*,application/pdf" capture="environment" label={t('f.photo')} required hint={t('f.fileHint')} />
                <Field name="caption" label={t('f.caption')} />
                <SelectField name="taskId" label={t('f.task')} placeholder={t('common.none')} options={tasks.map((k) => ({ value: k.id, label: k.title }))} />
                <SubmitButton>{t('common.upload')}</SubmitButton>
              </ActionForm>
            </Section>
          ) : <span />}
        />
      )}

      {active === 'materials' && (
        <Split
          main={<Section title={t('p.project.tab.materials')}>
            {materials.length === 0 ? <EmptyState title={t('common.noData')} /> : (
              <Table>
                <thead><tr><Th>{t('f.description')}</Th><Th>{t('f.quantity')}</Th><Th>{t('f.supplier')}</Th><Th>{t('f.expectedDate')}</Th><Th>{t('common.status')}</Th>{lead && <Th />}</tr></thead>
                <tbody>{materials.map((m) => (
                  <tr key={m.id}><Td>{m.description}</Td><Td>{Number(m.quantity)} {m.unit}</Td><Td>{m.supplier ?? '—'}</Td><Td>{formatDate(m.expected_date, locale)}</Td>
                    <Td><StatusBadge value={m.status} label={t(`e.materialStatus.${m.status}`)} /></Td>
                    {lead && <Td><ActionForm action={materialStatusAction} hideSuccess resetOnSuccess={false} className="flex items-end gap-1.5">
                      <input type="hidden" name="id" value={m.id} />
                      <SelectField name="status" aria-label={t('common.status')} defaultValue={m.status} options={enumOptions(t, 'materialStatus', MATERIAL_STATUS)} />
                      <SubmitButton size="sm" variant="secondary">{t('common.save')}</SubmitButton></ActionForm></Td>}
                  </tr>
                ))}</tbody>
              </Table>
            )}
          </Section>}
          side={lead && !closed ? (
            <Section title={t('a.addMaterial')}>
              <ActionForm action={materialAction} className="space-y-3">
                <input type="hidden" name="projectId" value={p.id} />
                <Field name="description" label={t('f.description')} required />
                <div className="grid grid-cols-2 gap-3"><Field name="quantity" label={t('f.quantity')} inputMode="decimal" required /><Field name="unit" label={t('f.unit')} defaultValue="nos" required /></div>
                <SelectField name="supplierCompanyId" label={t('f.supplier')} placeholder={t('common.none')} options={suppliers.map((s) => ({ value: s.id, label: s.legal_name }))} />
                <Field name="expectedDate" type="date" label={t('f.expectedDate')} />
                <SubmitButton>{t('common.add')}</SubmitButton>
              </ActionForm>
            </Section>
          ) : <span />}
        />
      )}

      {active === 'documents' && (
        <Split
          main={<Section title={t('p.project.tab.documents')} description={t('m.statutoryDocsNote')}>
            {documents.length === 0 ? <EmptyState title={t('common.noData')} /> : (
              <Table>
                <thead><tr><Th>{t('f.type')}</Th><Th>{t('f.reference')}</Th><Th>{t('f.validity')}</Th><Th>{t('common.status')}</Th><Th>{t('f.document')}</Th>{staff && can('compliance.document.approve') && <Th />}</tr></thead>
                <tbody>{documents.map((d) => (
                  <tr key={d.id}><Td>{t(`e.complianceDocType.${d.doc_type}`)}<span className="block text-xs text-slate-500">{d.authority}</span></Td><Td>{d.reference_number ?? '—'}</Td>
                    <Td>{formatDate(d.issue_date, locale)} – {formatDate(d.expiry_date, locale)}</Td>
                    <Td><StatusBadge value={d.verification_status} label={t(`e.verificationStatus.${d.verification_status}`)} />{d.rejection_reason && <span className="block text-xs text-slate-500">{d.rejection_reason}</span>}</Td>
                    <Td><FileLink id={d.file_id} label={t('common.view')} /></Td>
                    {staff && can('compliance.document.approve') && <Td>{d.verification_status === 'PENDING' && (
                      <ActionForm action={complianceDecisionAction} hideSuccess className="flex min-w-44 flex-col gap-1.5">
                        <input type="hidden" name="id" value={d.id} />
                        <Field name="reason" placeholder={t('f.rejectionReason')} aria-label={t('f.rejectionReason')} />
                        <div className="flex gap-1.5"><SubmitButton size="sm" variant="success" name="decision" value="approve">{t('a.verify')}</SubmitButton>
                          <SubmitButton size="sm" variant="secondary" name="decision" value="reject">{t('a.reject')}</SubmitButton></div>
                      </ActionForm>
                    )}</Td>}
                  </tr>
                ))}</tbody>
              </Table>
            )}
          </Section>}
          side={(lead || (staff && (can('compliance.manage') || can('project.manage')))) && !closed ? (
            <Section title={t('a.addDocument')}>
              <ActionForm action={complianceDocAction} className="space-y-3">
                <input type="hidden" name="projectId" value={p.id} />
                <SelectField name="docType" label={t('f.type')} required options={enumOptions(t, 'complianceDocType', COMPLIANCE_DOC_TYPE)} />
                <Field name="authority" label={t('f.authority')} /><Field name="referenceNumber" label={t('f.reference')} />
                <div className="grid grid-cols-2 gap-3"><Field name="issueDate" type="date" label={t('f.issueDate')} /><Field name="expiryDate" type="date" label={t('f.expiryDate')} /></div>
                <Field name="file" type="file" accept="application/pdf,image/*" label={t('f.document')} required hint={t('f.fileHint')} />
                <SubmitButton>{t('common.upload')}</SubmitButton>
              </ActionForm>
            </Section>
          ) : <span />}
        />
      )}

      {active === 'site' && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Section title={t('p.project.attendance')}>
            {attendance.length === 0 ? <EmptyState title={t('common.noData')} /> : (
              <Table className="min-w-0"><thead><tr><Th>{t('f.name')}</Th><Th>{t('f.type')}</Th><Th>{t('f.deviceTime')}</Th><Th>{t('f.serverTime')}</Th></tr></thead>
                <tbody>{attendance.map((a) => <tr key={a.id}><Td>{a.full_name}</Td><Td>{t(`m.attendance.${a.kind}`)}</Td><Td>{formatDateTime(a.captured_at_device, locale)}</Td><Td>{formatDateTime(a.received_at, locale)}</Td></tr>)}</tbody></Table>
            )}
          </Section>
          <Section title={t('p.project.checklists')}>
            {checklists.length === 0 ? <EmptyState title={t('common.noData')} /> : (
              <ul className="space-y-2 text-sm">{checklists.map((c) => (
                <li key={c.id} className="flex flex-wrap items-start justify-between gap-2"><span>{c.full_name}<span className="block text-xs text-slate-500">{formatDateTime(c.captured_at_device, locale)}{c.notes ? ` · ${c.notes}` : ''}</span></span>
                  <Badge tone={c.all_ok ? 'green' : 'red'}>{c.all_ok ? t('m.checklistOk') : t('m.checklistIssue')}</Badge></li>
              ))}</ul>
            )}
          </Section>
        </div>
      )}
    </>
  );
}
