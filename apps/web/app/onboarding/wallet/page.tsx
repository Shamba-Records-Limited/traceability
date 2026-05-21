import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { auth } from '../../../auth';
import { WALLET_HANDOFF_COOKIE } from '../types';

import { WalletReveal } from './wallet-reveal';

export const metadata = {
  title: 'Save your wallet keys',
};

interface WalletPayload {
  accountId: string;
  publicKey: string;
  privateKey: string;
  evmAddress: string;
  createTransactionId: string;
  initialBalanceTinybars: number;
  createdAt: string;
}

function parsePayload(raw: string | undefined): WalletPayload | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const o = parsed as Record<string, unknown>;
  if (
    typeof o.accountId !== 'string' ||
    typeof o.publicKey !== 'string' ||
    typeof o.privateKey !== 'string' ||
    typeof o.evmAddress !== 'string' ||
    typeof o.createTransactionId !== 'string' ||
    typeof o.initialBalanceTinybars !== 'number' ||
    typeof o.createdAt !== 'string'
  ) {
    return null;
  }
  return {
    accountId: o.accountId,
    publicKey: o.publicKey,
    privateKey: o.privateKey,
    evmAddress: o.evmAddress,
    createTransactionId: o.createTransactionId,
    initialBalanceTinybars: o.initialBalanceTinybars,
    createdAt: o.createdAt,
  };
}

export default async function WalletDownloadPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/sign-in');

  const cookieStore = await cookies();
  const handoff = cookieStore.get(WALLET_HANDOFF_COOKIE);
  const payload = parsePayload(handoff?.value);
  if (!payload) {
    // No cookie (expired, already consumed, or arrived here by typing
    // the URL directly). Send the user to the dashboard; if they
    // legitimately need to recover the key they cannot — by design,
    // we never see it again either.
    redirect('/dashboard');
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <header>
        <p className="text-sm font-medium uppercase tracking-widest text-leaf-600">One step left</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-soil-900">
          Save your wallet keys
        </h1>
        <p className="mt-3 text-sm text-soil-700">
          We&rsquo;ve created a Hedera account for you and funded it with a small amount of HBAR so
          you can start signing on-chain events. Your wallet&rsquo;s private key is shown below.
        </p>
      </header>

      <div className="mt-6 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">
        <strong className="font-semibold">We will not show this key again.</strong> If you lose it,
        you lose access to this wallet and the on-chain history attached to it. Save the JSON file
        somewhere safe (a password manager works) before continuing.
      </div>

      <WalletReveal payload={payload} />
    </main>
  );
}
