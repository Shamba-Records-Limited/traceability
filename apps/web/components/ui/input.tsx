import * as React from 'react';

import { cn } from '../../lib/utils';

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(function Input({ className, type, ...props }, ref) {
  return (
    <input
      type={type ?? 'text'}
      ref={ref}
      className={cn(
        'flex h-11 w-full rounded-md border border-soil-300 bg-white px-3 py-2 text-sm text-soil-900 shadow-sm placeholder:text-soil-500 focus:border-leaf-500 focus:outline-none focus:ring-2 focus:ring-leaf-500 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
});

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(
        'flex min-h-[88px] w-full rounded-md border border-soil-300 bg-white px-3 py-2 text-sm text-soil-900 shadow-sm placeholder:text-soil-500 focus:border-leaf-500 focus:outline-none focus:ring-2 focus:ring-leaf-500 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
});
