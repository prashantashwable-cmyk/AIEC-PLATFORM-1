import { confirmCollectionAction, customerDecisionAction, resumeMyLeadAction } from '@/app/actions/app';
import { FileLink, Timeline } from '@/components/common';
import { versionItems } from '@/components/views/quotation-view';
import { ActionForm, SelectField, SubmitButton, TextareaField } from '@/components/ui/form';
import { Alert, Badge, DataList, EmptyState, PageHeader, Section, StatusBadge, Table, Td, Th } from '@/components/ui';
import { formatDate, formatDateTime, formatINR, isoDateIST } from '@/lib/format';
import { load, pageCtx } from '@/server/page';
import { getCustomerLead } from '@/server/services/customer';
import { getComparison } from '@/server/services/quotations';

export default async function CustomerProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx, t, locale } = await pageCtx('customer');
  const d = await load(() => getCustomerLead(ctx, id));
  const cmp = await load(() => getComparison(ctx, id));
  const { lead, survey, order, project } = d;
  const deciding = ['CUSTOMER_REVIEW', 'NEGOTIATION'].includes(lead.status);
  const today = isoDateIST();
  const selectable = cmp.quotations.filter((q) => q.status === 'SUBMITTED');
  const rows = cmp.quotations.length ? versionItems(t, locale, cmp.quotations[0]).map((item) => item.label) : [];

  return (
    <>
      <PageHeader title={lead.project_name} back={{ href: '/customer', label: t('nav.myProjects') }}
        subtitle={<span className="flex flex-wrap items-center gap-2"><StatusBadge value={lead.status} label={t(`e.leadStatus.${lead.status}`)} />{lead.lead_number} · {t(`zone.${lead.zone_code}`)}</span>} />

      {lead.status === 'ON_HOLD' && (
        <Alert tone="amber" className="mb-4" title={t('e.leadStatus.ON_HOLD')}>
          <ActionForm action={resumeMyLeadAction} hideSuccess className="mt-2"><input type="hidden" name="id" value={id} /><SubmitButton size="sm">{t('a.resume')}</SubmitButton></ActionForm>
        </Alert>
      )}

      <div className="space-y-5">
        <div className="grid gap-5 lg:grid-cols-[2fr_1fr]">
          <Section title={t('p.lead.requirement')}>
            <DataList columns={3} items={[
              { label: t('f.address'), value: lead.address }, { label: t('f.buildingType'), value: t(`e.buildingType.${lead.building_type}`) },
              { label: t('f.liftCategory'), value: t(`e.liftCategory.${lead.lift_category}`) }, { label: t('f.floors'), value: lead.floors ?? '—' },
              { label: t('f.timeline'), value: t(`e.timeline.${lead.timeline}`) }, { label: t('f.siteReadiness'), value: t(`e.siteReadiness.${lead.site_readiness}`) },
            ]} />
            {survey && (
              <div className="mt-4 border-t border-slate-100 pt-4">
                <p className="mb-2 text-sm font-semibold">{t('p.survey.title')} <StatusBadge value={survey.status} label={t(`e.surveyStatus.${survey.status}`)} /></p>
                <DataList columns={3} items={[
                  { label: t('f.scheduledAt'), value: formatDateTime(survey.scheduled_at, locale) }, { label: t('f.surveyor'), value: survey.surveyor },
                  { label: t('f.floorsStops'), value: `${survey.floors ?? '—'} / ${survey.stops ?? '—'}` },
                  { label: t('f.shaftWidthMm'), value: survey.shaft_width_mm ?? '—' }, { label: t('f.shaftDepthMm'), value: survey.shaft_depth_mm ?? '—' },
                  { label: t('f.pitDepthMm'), value: survey.pit_depth_mm ?? '—' },
                ]} />
                <p className="mt-2 text-xs text-slate-500">{t('p.survey.notApproval')}</p>
              </div>
            )}
          </Section>
          <Section title={t('p.customerProject.progress')}>
            <Timeline items={d.events.map((e, i) => ({ key: String(i), title: t(`e.leadStatus.${e.to_status}`), meta: formatDateTime(e.created_at, locale) }))} />
          </Section>
        </div>

        <Section title={t('p.customerProject.compare')} description={t('p.customerProject.compareNote')}>
          {cmp.quotations.length === 0 ? <EmptyState title={t('p.customerProject.noQuotations')} hint={t('p.customerProject.noQuotationsHint')} /> : (
            <>
              {cmp.quotations.length === 1 && <Alert tone="amber" className="mb-3">{t('p.customerProject.singleQuote')}</Alert>}
              <Table>
                <thead><tr><Th>{t('f.item')}</Th>{cmp.quotations.map((q) => (
                  <Th key={q.id} className="min-w-52 normal-case">
                    <span className="block text-sm text-slate-900">{q.legal_name}</span>
                    <span className="mt-1 flex flex-wrap gap-1">
                      <StatusBadge value={q.status} label={t(`e.quotationStatus.${q.status}`)} />
                      {q.grade !== 'UNGRADED' && <Badge tone="green">{t(`e.partnerGrade.${q.grade}`)}</Badge>}
                    </span>
                  </Th>
                ))}</tr></thead>
                <tbody>
                  <tr><Td className="font-medium">{t('f.verification')}</Td>{cmp.quotations.map((q) => (
                    <Td key={q.id}><Badge tone={q.licence_valid_until ? 'green' : 'red'}>{q.licence_valid_until ? t('m.licenceValidUntil', { date: formatDate(q.licence_valid_until, locale) }) : t('m.noValidLicence')}</Badge>
                      <span className="mt-1 block"><Badge tone={q.insurance_valid_until ? 'green' : 'red'}>{q.insurance_valid_until ? t('m.insuranceValidUntil', { date: formatDate(q.insurance_valid_until, locale) }) : t('m.noValidInsurance')}</Badge></span></Td>
                  ))}</tr>
                  <tr><Td className="font-medium">{t('landing.mockScore')}<span className="block text-xs font-normal text-slate-500">{t('m.scoreAdvisory')}</span></Td>
                    {cmp.quotations.map((q) => <Td key={q.id} className="font-semibold text-brand-700">{q.advisory_score ?? '—'}</Td>)}</tr>
                  {rows.map((label, i) => (
                    <tr key={label}><Td className="font-medium">{label}</Td>{cmp.quotations.map((q) => <Td key={q.id}>{versionItems(t, locale, q)[i].value}</Td>)}</tr>
                  ))}
                  <tr><Td className="font-medium">{t('f.paymentMilestones')}</Td>{cmp.quotations.map((q) => (
                    <Td key={q.id}><ul className="space-y-0.5 text-xs">{cmp.milestones.filter((m) => m.version_id === q.version_id).map((m) => <li key={m.seq}>{m.name}: {Number(m.percent)}%</li>)}</ul></Td>
                  ))}</tr>
                  <tr><Td className="font-medium">{t('f.originalQuotation')}</Td>{cmp.quotations.map((q) => <Td key={q.id}><FileLink id={q.original_file_id} label={`${q.quotation_number} · v${q.version_no}`} /></Td>)}</tr>
                  {cmp.quotations.some((q) => q.partner_response_note || q.customer_request_note) && (
                    <tr><Td className="font-medium">{t('common.notes')}</Td>{cmp.quotations.map((q) => (
                      <Td key={q.id} className="text-xs">{q.customer_request_note && <span className="block">{t('f.customerRequest')}: {q.customer_request_note}</span>}{q.partner_response_note && <span className="block">{t('f.partnerResponse')}: {q.partner_response_note}</span>}</Td>
                    ))}</tr>
                  )}
                </tbody>
              </Table>

              {deciding && (
                <div className="mt-5 grid gap-5 border-t border-slate-100 pt-5 lg:grid-cols-2">
                  <div>
                    <h3 className="text-sm font-semibold">{t('p.customerProject.decide')}</h3>
                    <p className="mt-1 text-sm text-slate-600">{t('p.customerProject.decideNote')}</p>
                    <ActionForm action={customerDecisionAction} className="mt-3 space-y-3">
                      <input type="hidden" name="leadId" value={id} />
                      <SelectField name="quotationId" label={t('f.partner')} required placeholder={t('common.select')}
                        options={selectable.map((q) => ({ value: q.id, label: `${q.legal_name} · ${formatINR(q.total_amount, locale)}${q.validity_date < today ? ` (${t('e.quotationStatus.EXPIRED')})` : ''}` }))} />
                      <TextareaField name="note" label={t('p.customerProject.noteForPartner')} rows={2} />
                      <div className="flex flex-wrap gap-2">
                        <SubmitButton name="action" value="SELECT" variant="success" confirm={t('m.confirmSelectPartner')} data-testid="select-partner">{t('landing.mockSelect')}</SubmitButton>
                        <SubmitButton name="action" value="NEGOTIATE" variant="secondary">{t('a.negotiate')}</SubmitButton>
                        <SubmitButton name="action" value="CLARIFY" variant="secondary">{t('a.askClarification')}</SubmitButton>
                      </div>
                    </ActionForm>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold">{t('p.customerProject.other')}</h3>
                    <ActionForm action={customerDecisionAction} className="mt-3 space-y-3">
                      <input type="hidden" name="leadId" value={id} />
                      <TextareaField name="note" label={t('f.reason')} rows={2} />
                      <div className="flex flex-wrap gap-2">
                        {lead.status === 'CUSTOMER_REVIEW' && <SubmitButton name="action" value="REQUEST_ANOTHER" variant="secondary">{t('a.requestAnother')}</SubmitButton>}
                        <SubmitButton name="action" value="HOLD" variant="secondary">{t('a.putOnHold')}</SubmitButton>
                        <SubmitButton name="action" value="REJECT_ALL" variant="danger" confirm={t('m.confirmRejectAll')}>{t('a.rejectAll')}</SubmitButton>
                      </div>
                    </ActionForm>
                  </div>
                </div>
              )}
            </>
          )}
        </Section>

        {order && (
          <Section title={`${t('f.order')} ${order.order_number}`} actions={<StatusBadge value={order.status} label={t(`e.orderStatus.${order.status}`)} />}>
            <DataList columns={3} items={[
              { label: t('f.partner'), value: order.legal_name }, { label: t('f.frozenQuotation'), value: `${order.quotation_number} · v${order.version_no}` },
              { label: t('f.grossOrderValue'), value: formatINR(order.gross_order_value, locale) }, { label: t('f.contractReference'), value: order.contract_reference ?? '—' },
              { label: t('f.contractAcceptedOn'), value: formatDate(order.contract_accepted_on, locale) }, { label: t('f.contractDocument'), value: <FileLink id={order.contract_file_id} label={t('common.view')} /> },
            ]} />
            <p className="mt-3 text-xs text-slate-500">{t('p.order.notStatutory')}</p>
          </Section>
        )}

        {project && (
          <>
            <Section title={`${t('p.customerProject.project')} ${project.project_number}`} actions={<StatusBadge value={project.status} label={t(`e.projectStatus.${project.status}`)} />}
              description={project.supervisor_name ? `${t('f.supervisor')}: ${project.supervisor_name}` : undefined}>
              {project.status === 'STOP_WORK' && <Alert tone="red" className="mb-3">{t('m.stopWorkNote')}</Alert>}
              <Table>
                <thead><tr><Th>#</Th><Th>{t('f.milestone')}</Th><Th>%</Th><Th>{t('f.amount')}</Th><Th>{t('f.dueDate')}</Th><Th>{t('common.status')}</Th></tr></thead>
                <tbody>{d.milestones.map((m) => (
                  <tr key={m.id}><Td>{m.seq}</Td><Td>{m.name}</Td><Td>{Number(m.percent)}%</Td><Td>{formatINR(m.amount_due, locale)}</Td><Td>{formatDate(m.due_date, locale)}</Td>
                    <Td><StatusBadge value={m.status} label={t(`e.milestoneStatus.${m.status}`)} /></Td></tr>
                ))}</tbody>
              </Table>
              {d.warranty && <p className="mt-3 text-sm">{t('f.warranty')}: {formatDate(d.warranty.starts_on, locale)} – {formatDate(d.warranty.ends_on, locale)}</p>}
            </Section>

            <Section title={t('p.customerProject.payments')} description={t('p.customerProject.paymentsNote')}>
              {d.collections.length === 0 ? <EmptyState title={t('common.noData')} /> : (
                <Table>
                  <thead><tr><Th>{t('common.date')}</Th><Th>{t('f.milestone')}</Th><Th>{t('f.amount')}</Th><Th>{t('f.paymentMode')}</Th><Th>{t('common.status')}</Th><Th>{t('p.customerProject.yourConfirmation')}</Th></tr></thead>
                  <tbody>{d.collections.map((c) => (
                    <tr key={c.id}><Td>{formatDate(c.collection_date, locale)}</Td><Td>{c.milestone_name ?? '—'}</Td><Td className="font-medium">{formatINR(c.amount_received, locale)}</Td>
                      <Td>{t(`e.paymentMode.${c.payment_mode}`)}<span className="block text-xs text-slate-500">{c.partner_receipt_no}</span></Td>
                      <Td><StatusBadge value={c.status} label={t(`e.collectionStatus.${c.status}`)} /></Td>
                      <Td>{c.customer_confirmed_at ? <Badge tone="green">{t('m.customerConfirmed')}</Badge> : !['REJECTED', 'REFUNDED'].includes(c.status) ? (
                        <ActionForm action={confirmCollectionAction} hideSuccess><input type="hidden" name="id" value={c.id} />
                          <SubmitButton size="sm" variant="secondary" confirm={t('m.confirmIPaid')}>{t('a.confirmIPaid')}</SubmitButton></ActionForm>
                      ) : '—'}</Td></tr>
                  ))}</tbody>
                </Table>
              )}
            </Section>

            <div className="grid gap-5 lg:grid-cols-2">
              <Section title={t('p.project.tab.documents')} description={t('m.statutoryDocsNote')}>
                {d.documents.length === 0 ? <EmptyState title={t('common.noData')} /> : (
                  <ul className="space-y-2 text-sm">{d.documents.map((doc) => (
                    <li key={doc.id} className="flex flex-wrap items-center justify-between gap-2"><FileLink id={doc.file_id} label={t(`e.complianceDocType.${doc.doc_type}`)} />
                      <StatusBadge value={doc.verification_status} label={t(`e.verificationStatus.${doc.verification_status}`)} /></li>
                  ))}</ul>
                )}
                {d.defects.length > 0 && (
                  <ul className="mt-4 space-y-1 border-t border-slate-100 pt-3 text-sm">{d.defects.map((df, i) => (
                    <li key={i} className="flex flex-wrap justify-between gap-2"><span>{df.description}</span><StatusBadge value={df.status} label={t(`e.defectStatus.${df.status}`)} /></li>
                  ))}</ul>
                )}
              </Section>
              <Section title={t('p.project.tab.evidence')}>
                {d.evidence.length === 0 ? <EmptyState title={t('common.noData')} /> : (
                  <ul className="space-y-2 text-sm">{d.evidence.map((e) => (
                    <li key={e.file_id}><FileLink id={e.file_id} label={e.caption || t('f.photo')} /><span className="ml-2 text-xs text-slate-500">{formatDateTime(e.received_at, locale)}</span></li>
                  ))}</ul>
                )}
              </Section>
            </div>
          </>
        )}
      </div>
    </>
  );
}
