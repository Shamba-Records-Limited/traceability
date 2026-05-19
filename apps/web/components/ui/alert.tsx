import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '../../lib/utils';

const alertVariants = cva(
  'relative w-full rounded-lg border px-4 py-3 text-sm [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:h-5 [&>svg]:w-5 [&>svg]:text-current [&>svg+div]:translate-y-[-3px] [&>svg~*]:pl-7',
  {
    variants: {
      tone: {
        info: 'border-leaf-300 bg-leaf-50 text-leaf-900',
        warning: 'border-amber-300 bg-amber-50 text-amber-900',
        danger: 'border-red-300 bg-red-50 text-red-900',
        success: 'border-leaf-300 bg-leaf-50 text-leaf-900',
      },
    },
    defaultVariants: { tone: 'info' },
  },
);

export const Alert = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>
>(function Alert({ className, tone, ...props }, ref) {
  return (
    <div ref={ref} role="alert" className={cn(alertVariants({ tone }), className)} {...props} />
  );
});

export const AlertTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(function AlertTitle({ className, ...props }, ref) {
  return (
    <h5
      ref={ref}
      className={cn('mb-1 font-medium leading-none tracking-tight', className)}
      {...props}
    />
  );
});

export const AlertDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(function AlertDescription({ className, ...props }, ref) {
  return <div ref={ref} className={cn('text-sm leading-relaxed', className)} {...props} />;
});
