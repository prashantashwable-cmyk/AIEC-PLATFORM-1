import type { ReactNode } from 'react';
import { AppShell } from '@/components/shell/app-shell';
import { requirePortal } from '@/server/auth';

export default async function Layout({ children }: { children: ReactNode }) {
  const ctx = await requirePortal('admin');
  return <AppShell portal="admin" ctx={ctx}>{children}</AppShell>;
}
