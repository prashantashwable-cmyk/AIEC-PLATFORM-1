import { materialStatusAction, productAction, productActiveAction } from '@/app/actions/app';
import { FileLink, Split, enumOptions } from '@/components/common';
import { ActionForm, Field, SelectField, SubmitButton, TextareaField } from '@/components/ui/form';
import { Badge, EmptyState, PageHeader, Section, StatusBadge, Table, Td, Th } from '@/components/ui';
import { MATERIAL_STATUS } from '@/lib/enums';
import { formatDate } from '@/lib/format';
import { load, pageCtx } from '@/server/page';
import { getCatalogue } from '@/server/services/partnerhome';

export default async function CataloguePage() {
  const { ctx, t, locale } = await pageCtx('partner');
  const { products, supplyOrders } = await load(() => getCatalogue(ctx));
  return (
    <>
      <PageHeader title={t('nav.catalogue')} subtitle={t('p.catalogue.subtitle')} />
      <Split
        main={<>
          <Section title={t('p.catalogue.products')}>
            {products.length === 0 ? <EmptyState title={t('common.noData')} /> : (
              <Table>
                <thead><tr><Th>{t('f.product')}</Th><Th>{t('f.category')}</Th><Th>{t('f.specification')}</Th><Th>{t('f.document')}</Th><Th>{t('common.status')}</Th><Th /></tr></thead>
                <tbody>{products.map((p) => (
                  <tr key={p.id}><Td>{p.name}<span className="block text-xs text-slate-500">{p.model}</span></Td><Td>{p.category}</Td><Td>{p.specification ?? '—'}</Td>
                    <Td><FileLink id={p.document_file_id} label={t('common.view')} /></Td><Td><Badge tone={p.is_active ? 'green' : 'gray'}>{p.is_active ? t('f.active') : t('m.inactive')}</Badge></Td>
                    <Td><ActionForm action={productActiveAction} hideSuccess><input type="hidden" name="id" value={p.id} /><input type="hidden" name="active" value={p.is_active ? 'no' : 'yes'} />
                      <SubmitButton size="sm" variant="secondary">{p.is_active ? t('a.deactivate') : t('a.activate')}</SubmitButton></ActionForm></Td></tr>
                ))}</tbody>
              </Table>
            )}
          </Section>
          <Section title={t('p.catalogue.supplyOrders')} description={t('p.catalogue.supplyNote')}>
            {supplyOrders.length === 0 ? <EmptyState title={t('common.noData')} /> : (
              <Table>
                <thead><tr><Th>{t('f.description')}</Th><Th>{t('f.quantity')}</Th><Th>{t('f.buyer')}</Th><Th>{t('f.expectedDate')}</Th><Th>{t('common.status')}</Th><Th /></tr></thead>
                <tbody>{supplyOrders.map((m) => (
                  <tr key={m.id}><Td>{m.description}</Td><Td>{Number(m.quantity)} {m.unit}</Td><Td>{m.buyer}</Td><Td>{formatDate(m.expected_date, locale)}</Td>
                    <Td><StatusBadge value={m.status} label={t(`e.materialStatus.${m.status}`)} /></Td>
                    <Td><ActionForm action={materialStatusAction} hideSuccess resetOnSuccess={false} className="flex items-end gap-1.5"><input type="hidden" name="id" value={m.id} />
                      <SelectField name="status" aria-label={t('common.status')} defaultValue={m.status} options={enumOptions(t, 'materialStatus', MATERIAL_STATUS)} />
                      <SubmitButton size="sm" variant="secondary">{t('common.save')}</SubmitButton></ActionForm></Td></tr>
                ))}</tbody>
              </Table>
            )}
          </Section>
        </>}
        side={<Section title={t('a.addProduct')}>
          <ActionForm action={productAction} className="space-y-3">
            <Field name="name" label={t('f.product')} required /><Field name="model" label={t('f.model')} /><Field name="category" label={t('f.category')} required />
            <TextareaField name="specification" label={t('f.specification')} rows={2} />
            <Field name="file" type="file" accept="application/pdf,image/*" label={t('f.document')} hint={t('f.fileHint')} />
            <SubmitButton>{t('common.add')}</SubmitButton>
          </ActionForm>
        </Section>}
      />
    </>
  );
}
