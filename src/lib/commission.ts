// Commission arithmetic in integer paise (never floating point). Spec 7.3:
//   commission_amount = verified_eligible_collection × applicable_commission_rate

/** "600000" | "600000.5" | "600000.50" → paise as bigint. */
export function toPaise(amount: string | number): bigint {
  const text = typeof amount === 'number' ? amount.toFixed(2) : amount.trim();
  const m = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(text);
  if (!m) throw new Error(`Invalid money amount: ${amount}`);
  const paise = BigInt(m[2]) * 100n + BigInt((m[3] ?? '').padEnd(2, '0') || '0');
  return m[1] === '-' ? -paise : paise;
}

export function fromPaise(paise: bigint): string {
  const negative = paise < 0n;
  const abs = negative ? -paise : paise;
  return `${negative ? '-' : ''}${abs / 100n}.${String(abs % 100n).padStart(2, '0')}`;
}

/** Percentage with up to four decimals ("2", "2.5", "2.0000") → ten-thousandths of a percent. */
export function rateToE4(ratePercent: string | number): bigint {
  const text = typeof ratePercent === 'number' ? ratePercent.toFixed(4) : ratePercent.trim();
  const m = /^(\d+)(?:\.(\d{1,4}))?$/.exec(text);
  if (!m) throw new Error(`Invalid rate: ${ratePercent}`);
  return BigInt(m[1]) * 10000n + BigInt((m[2] ?? '').padEnd(4, '0') || '0');
}

/** Rounds half away from zero to the nearest paisa. */
export function percentOf(amountPaise: bigint, rateE4: bigint): bigint {
  const numerator = amountPaise * rateE4;
  const denominator = 1_000_000n; // 100 (percent) × 10_000 (rate scale)
  const half = denominator / 2n;
  return numerator >= 0n ? (numerator + half) / denominator : -((-numerator + half) / denominator);
}

/** Commission in rupees (string, 2 decimals) for a verified eligible collection. */
export function commissionFor(eligibleAmount: string, ratePercent: string): string {
  return fromPaise(percentOf(toPaise(eligibleAmount), rateToE4(ratePercent)));
}

export function addMoney(...amounts: string[]): string {
  return fromPaise(amounts.reduce((sum, a) => sum + toPaise(a), 0n));
}
export function subMoney(a: string, b: string): string {
  return fromPaise(toPaise(a) - toPaise(b));
}
export function compareMoney(a: string, b: string): number {
  const d = toPaise(a) - toPaise(b);
  return d === 0n ? 0 : d > 0n ? 1 : -1;
}
