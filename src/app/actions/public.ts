'use server';

import { cookies } from 'next/headers';
import { z } from 'zod';
import type { ActionResult } from '@/components/ui/form';
import { zOptText, zPhone, zText, zUuid } from '@/lib/validation';
import { runPublicAction } from '@/server/action';
import { SESSION_COOKIE, clientMeta, getSessionUser, setSessionCookie } from '@/server/auth';
import { demoLogin, destroySession, requestOtp, verifyOtp } from '@/server/authcore';
import { createLead, leadInputSchema } from '@/server/services/leads';

export async function submitEnquiryAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  return runPublicAction(leadInputSchema, formData, async (input) => {
    // A signed-in customer submits under their own account; everyone else is a public website enquiry.
    const ctx = await getSessionUser();
    const actor = ctx && ctx.customerId && !ctx.isInternal ? ctx : null;
    const lead = await createLead(actor, input);
    return { message: 'enquiry.successBody', params: { number: lead.leadNumber } };
  });
}

export async function requestOtpAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  return runPublicAction(z.object({ phone: zPhone }), formData, async (input) => {
    const { phone, sandboxCode } = await requestOtp(input.phone);
    return { message: 'auth.otpHint', params: { phone, code: sandboxCode } };
  });
}

export async function verifyOtpAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  return runPublicAction(z.object({ phone: zPhone, code: zText(6), name: zOptText(120) }), formData, async (input) => {
    const { token } = await verifyOtp(input.phone, input.code, input.name ?? null, await clientMeta());
    await setSessionCookie(token);
    return { redirect: '/app' };
  });
}

export async function demoLoginAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  return runPublicAction(z.object({ userId: zUuid }), formData, async (input) => {
    const token = await demoLogin(input.userId, await clientMeta());
    await setSessionCookie(token);
    return { redirect: '/app' };
  });
}

export async function logoutAction(_prev: ActionResult, _formData: FormData): Promise<ActionResult> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await destroySession(token);
  store.delete(SESSION_COOKIE);
  return { ok: true, redirect: '/' };
}
