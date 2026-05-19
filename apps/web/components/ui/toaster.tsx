'use client';

import { Toaster as SonnerToaster } from 'sonner';

/**
 * App-wide toast root. Mounted once in `app/layout.tsx`. Server
 * actions and client components both call `toast()` from `sonner` to
 * surface success / failure messages without inline alert blocks.
 */
export function Toaster() {
  return (
    <SonnerToaster
      position="top-right"
      richColors
      closeButton
      toastOptions={{
        classNames: {
          toast: 'border border-soil-200 bg-white text-soil-900 shadow-lg',
          description: 'text-soil-700',
          actionButton: 'bg-leaf-600 text-white',
          cancelButton: 'bg-soil-100 text-soil-900',
        },
      }}
    />
  );
}
