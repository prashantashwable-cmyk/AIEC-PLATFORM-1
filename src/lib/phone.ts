/** Normalises Indian mobile numbers to E.164 (+91XXXXXXXXXX). Returns null when invalid. */
export function normalizePhone(input: string | null | undefined): string | null {
  if (!input) return null;
  let digits = input.replace(/[^0-9]/g, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return /^[6-9][0-9]{9}$/.test(digits) ? `+91${digits}` : null;
}

export function displayPhone(phone: string | null | undefined): string {
  if (!phone) return '—';
  const m = /^\+91(\d{5})(\d{5})$/.exec(phone);
  return m ? `+91 ${m[1]} ${m[2]}` : phone;
}

/** Partially hides a number for roles that only need to recognise it. */
export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return '—';
  return phone.replace(/^(\+91\d{2})\d{6}(\d{2})$/, '$1••••••$2');
}
