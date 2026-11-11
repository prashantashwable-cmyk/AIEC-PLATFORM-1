import type { ReactNode } from 'react';
import { AppShell } from '@/components/shell/app-shell';
import { requirePortal } from '@/server/auth';

export default async function Layout({ children }: { children: ReactNode }) {
  const ctx = await requirePortal('customer');
  return <AppShell portal="customer" ctx={ctx}>{children}</AppShell>;
}
