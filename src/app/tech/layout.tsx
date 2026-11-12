import type { ReactNode } from 'react';
import { AppShell } from '@/components/shell/app-shell';
import { OfflineProvider } from '@/components/tech/offline-provider';
import { requirePortal } from '@/server/auth';

export default async function Layout({ children }: { children: ReactNode }) {
  const ctx = await requirePortal('tech');
  return <AppShell portal="tech" ctx={ctx}><OfflineProvider>{children}</OfflineProvider></AppShell>;
}
