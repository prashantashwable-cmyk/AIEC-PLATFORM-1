// Duplicate-lead detection (spec 5.3). Produces review candidates only - nothing is ever auto-merged.

export interface LeadFingerprint {
  phone: string;
  projectName: string;
  address: string;
  zoneId: string;
  liftCategory: string;
  latitude: number | null;
  longitude: number | null;
}
export type DuplicateReason = 'SAME_PHONE' | 'SIMILAR_PROJECT_NAME' | 'SIMILAR_ADDRESS' | 'NEARBY_LOCATION' | 'SAME_AREA_AND_REQUIREMENT';
export const DUPLICATE_THRESHOLD = 50;

function tokens(text: string): Set<string> {
  return new Set(text.toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter((t) => t.length > 1));
}
export function similarity(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.size || !tb.size) return 0;
  let common = 0;
  for (const t of ta) if (tb.has(t)) common++;
  return common / (ta.size + tb.size - common);
}
export function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
  return 6_371_000 * 2 * Math.asin(Math.sqrt(a));
}

export function compareLeads(a: LeadFingerprint, b: LeadFingerprint): { score: number; reasons: DuplicateReason[] } {
  const reasons: DuplicateReason[] = [];
  let score = 0;
  if (a.phone === b.phone) { score += 40; reasons.push('SAME_PHONE'); }
  if (similarity(a.projectName, b.projectName) >= 0.6) { score += 25; reasons.push('SIMILAR_PROJECT_NAME'); }
  if (similarity(a.address, b.address) >= 0.6) { score += 25; reasons.push('SIMILAR_ADDRESS'); }
  if (a.latitude !== null && a.longitude !== null && b.latitude !== null && b.longitude !== null
    && distanceMeters(a.latitude, a.longitude, b.latitude, b.longitude) <= 100) { score += 30; reasons.push('NEARBY_LOCATION'); }
  if (a.zoneId === b.zoneId && a.liftCategory === b.liftCategory) { score += 10; reasons.push('SAME_AREA_AND_REQUIREMENT'); }
  return { score, reasons };
}

/** A single signal (phone alone, or coordinates alone) is never enough to flag a duplicate. */
export function isLikelyDuplicate(result: { score: number; reasons: DuplicateReason[] }): boolean {
  return result.score >= DUPLICATE_THRESHOLD && result.reasons.length >= 2;
}
