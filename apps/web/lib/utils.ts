import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Concatenate `clsx` and `tailwind-merge` to produce a deduplicated className string.
 * This is the canonical helper used by every shadcn-style component.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
