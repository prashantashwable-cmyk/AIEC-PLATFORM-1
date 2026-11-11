import { Loader2 } from 'lucide-react';

export default function Loading() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center" role="status" aria-busy="true">
      <Loader2 className="size-7 animate-spin text-brand-600" aria-hidden />
    </div>
  );
}
