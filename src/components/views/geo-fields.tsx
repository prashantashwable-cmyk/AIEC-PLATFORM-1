'use client';

import { useState } from 'react';
import { MapPin } from 'lucide-react';
import { Field } from '@/components/ui/form';
import { Button } from '@/components/ui';
import { useT } from '@/i18n/client';

/** Latitude / longitude / accuracy inputs with a "use my location" helper. Values can also be typed manually. */
export function GeoFields({ latitude, longitude, accuracy }: { latitude?: string | null; longitude?: string | null; accuracy?: string | null }) {
  const t = useT();
  const [pos, setPos] = useState({ lat: latitude ?? '', lng: longitude ?? '', acc: accuracy ?? '' });
  const [error, setError] = useState(false);
  function locate() {
    setError(false);
    if (!navigator.geolocation) { setError(true); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => setPos({ lat: p.coords.latitude.toFixed(6), lng: p.coords.longitude.toFixed(6), acc: p.coords.accuracy.toFixed(1) }),
      () => setError(true), { enableHighAccuracy: true, timeout: 15000 },
    );
  }
  return (
    <div className="sm:col-span-2 lg:col-span-3">
      <div className="grid gap-4 sm:grid-cols-3">
        <Field name="latitude" label={t('f.latitude')} inputMode="decimal" value={pos.lat} onChange={(e) => setPos({ ...pos, lat: e.target.value })} />
        <Field name="longitude" label={t('f.longitude')} inputMode="decimal" value={pos.lng} onChange={(e) => setPos({ ...pos, lng: e.target.value })} />
        <Field name="accuracyM" label={t('f.accuracyM')} inputMode="decimal" value={pos.acc} onChange={(e) => setPos({ ...pos, acc: e.target.value })} />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <Button type="button" variant="secondary" size="sm" onClick={locate}><MapPin className="size-4" aria-hidden />{t('a.useMyLocation')}</Button>
        {error && <span className="text-xs text-red-700">{t('m.locationUnavailable')}</span>}
      </div>
    </div>
  );
}
