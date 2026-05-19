import QRCode from 'qrcode';

/**
 * Render a URL as a printable SVG QR code. SVG keeps the rendering
 * crisp at any size (consumer-facing packaging is the main consumer)
 * and stays cheap to serialise into the response without a buffer
 * round-trip. Defaults to error-correction level M (15% redundancy),
 * which is enough for indoor labels; high-contrast labels with
 * physical wear should bump to `H` (30%) at the call site.
 */
export async function renderQrSvg(
  data: string,
  options: { margin?: number; width?: number; level?: 'L' | 'M' | 'Q' | 'H' } = {},
): Promise<string> {
  return QRCode.toString(data, {
    type: 'svg',
    margin: options.margin ?? 1,
    width: options.width ?? 320,
    errorCorrectionLevel: options.level ?? 'M',
    color: { dark: '#0d3b1f', light: '#ffffff' },
  });
}

/**
 * Render a URL as a data-URI PNG. Useful for inlining in PDFs or
 * embedding in HTML pages that don't want a server round-trip for the
 * QR image.
 */
export async function renderQrPngDataUri(
  data: string,
  options: { width?: number; level?: 'L' | 'M' | 'Q' | 'H' } = {},
): Promise<string> {
  return QRCode.toDataURL(data, {
    margin: 1,
    width: options.width ?? 512,
    errorCorrectionLevel: options.level ?? 'H',
    color: { dark: '#0d3b1f', light: '#ffffff' },
  });
}

/**
 * Canonical public URL for a batch's consumer-facing traceability
 * page. Pulls the base origin from `NEXT_PUBLIC_APP_URL` and falls
 * back to the deployment's `VERCEL_URL` (handy for preview deploys).
 * Strips any trailing slash so the appended path always reads cleanly.
 */
export function publicTraceUrl(batchId: string): string {
  const fromEnv = (process.env.NEXT_PUBLIC_APP_URL ?? '').trim();
  const fromVercel = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '';
  const base = (fromEnv || fromVercel || 'http://localhost:3000').replace(/\/$/, '');
  return `${base}/trace/${batchId}`;
}
