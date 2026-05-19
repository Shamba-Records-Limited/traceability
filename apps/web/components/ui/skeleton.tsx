import { cn } from '../../lib/utils';

/**
 * Plain shimmering placeholder for use while server-component data
 * loads. Use as a sibling block in `<Suspense fallback>` boundaries
 * or as a loading state inside client forms.
 */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('animate-pulse rounded-md bg-soil-200/80', className)} {...props} />;
}
