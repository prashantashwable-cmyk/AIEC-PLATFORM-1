/** Version of the privacy notice shown to users; stored with every consent record. */
export const PRIVACY_NOTICE_VERSION = '2026-11-v1';
/** Version of the finance-referral consent text; stored with every finance consent. */
export const FINANCE_CONSENT_VERSION = '2026-11-v1';
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
export const ALLOWED_UPLOAD_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
export const PAGE_SIZE = 20;

/** Sandbox mode enables the on-screen OTP and demo sign-in. It must be off in production. */
export function isSandbox(): boolean {
  return process.env.AUTH_SANDBOX === 'true';
}
