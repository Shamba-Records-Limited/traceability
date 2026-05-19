import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '../../lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset',
  {
    variants: {
      tone: {
        success: 'bg-leaf-50 text-leaf-700 ring-leaf-200',
        warning: 'bg-soil-100 text-soil-800 ring-soil-300',
        danger: 'bg-red-50 text-red-700 ring-red-200',
        neutral: 'bg-soil-100 text-soil-700 ring-soil-200',
        info: 'bg-blue-50 text-blue-700 ring-blue-200',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
