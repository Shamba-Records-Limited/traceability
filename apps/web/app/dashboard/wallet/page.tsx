import Link from 'next/link';
import { redirect } from 'next/navigation';

import { auth } from '../../../auth';
import { getActorForUser } from '../../../lib/actor';

import { ReplaceWalletForm } from './replace-wallet-form';
import { TestSignatureButton } from './test-signature-button';

export const metadata = {
  title: 'Hedera wallet',
};

/**
 * Hashscan explorer URL for the configured network. Defaults to mainnet
 * because that is the user-facing default; testnet rendering still
 * works because Hashscan accepts the path on every supported network.
 */
function hashscanAccountUrl(accountId: string): string {
  const network = (process.env.NEXT_PUBLIC_HEDERA_NETWORK || 'mainnet').toLowerCase();
  return `https://hashscan.io/${network}/account/${accountId}`;
}

export default async function WalletPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/sign-in');
  const actor = await getActorForUser(session.user.id);
  if (!actor) redirect('/onboarding');

  const hasWallet = actor.hederaAccountId !== null;
  const isSystemGenerated = actor.walletProvider === 'system_generated';

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <header>
        <p className="text-sm font-medium uppercase tracking-widest text-leaf-600">Integrations</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-soil-900">Hedera wallet</h1>
        <p className="mt-3 text-sm text-soil-700">
          The Hedera account that signs your on-chain events and custodies the HTS NFTs minted for
          your batches.
        </p>
      </header>

      {!hasWallet && (
        <section className="mt-8 rounded-md border border-amber-300 bg-amber-50 p-6 text-sm text-amber-900">
          <h2 className="text-sm font-semibold">Wallet provisioning pending</h2>
          <p className="mt-2">
            We couldn&rsquo;t reach the Hedera publisher when you onboarded. You can finish setup by
            pasting an existing wallet below, or wait for the platform to retry — the next
            background sweep will provision one for you.
          </p>
        </section>
      )}

      {hasWallet && (
        <section className="mt-8 rounded-md border border-soil-200 bg-white p-6">
          <h2 className="text-sm font-semibold text-soil-900">
            {isSystemGenerated ? 'System-managed wallet' : 'User-provided wallet'}
          </h2>
          <p className="mt-2 text-xs text-soil-600">
            {isSystemGenerated
              ? 'Shamba generated this Hedera account for you at onboarding and holds the private key encrypted at rest. We sign transactions on your behalf when you act in the dashboard. If you prefer to bring your own wallet, replace it below — the system-generated key will be overwritten and you cannot recover it.'
              : 'You provided this wallet. Shamba holds the encrypted private key on file so it can sign transactions on your behalf. You can replace it any time below.'}
          </p>
          <dl className="mt-4 space-y-3 text-xs text-soil-700">
            <div>
              <dt className="font-medium text-soil-900">Account id</dt>
              <dd className="break-all font-mono text-sm text-soil-900">{actor.hederaAccountId}</dd>
            </div>
            <div>
              <dt className="font-medium text-soil-900">Hashscan</dt>
              <dd>
                <a
                  href={hashscanAccountUrl(actor.hederaAccountId!)}
                  target="_blank"
                  rel="noreferrer"
                  className="text-leaf-700 underline"
                >
                  View account on Hashscan
                </a>
              </dd>
            </div>
            <div>
              <dt className="font-medium text-soil-900">Provider</dt>
              <dd className="font-mono">
                {isSystemGenerated ? 'system_generated' : 'user_provided'}
              </dd>
            </div>
          </dl>
        </section>
      )}

      <section className="mt-8 rounded-md border border-soil-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-soil-900">
          {isSystemGenerated ? 'Bring your own wallet (advanced)' : 'Replace this wallet'}
        </h2>
        <p className="mt-2 text-xs text-soil-600">
          Paste an existing Hedera account id and its private key. We&rsquo;ll validate the pair by
          submitting a tiny signed transaction, then store the key encrypted at rest. The previous
          wallet&rsquo;s key is dropped from our DB — if you need to keep using it, export it first
          from another tool.
        </p>
        <ReplaceWalletForm actorId={actor.id} />
      </section>

      {hasWallet && (
        <section className="mt-8 rounded-md border border-soil-200 bg-white p-6">
          <h2 className="text-sm font-semibold text-soil-900">Diagnostics</h2>
          <p className="mt-2 text-xs text-soil-600">
            Confirm the platform can sign as your actor by decrypting your wallet&rsquo;s private
            key in memory and printing its fingerprint. This does not submit a transaction.
          </p>
          <div className="mt-3">
            <TestSignatureButton />
          </div>
        </section>
      )}

      <section className="mt-8 rounded-md border border-soil-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-soil-900">Actor record</h2>
        <dl className="mt-3 space-y-2 text-xs text-soil-700">
          <div>
            <dt className="font-medium text-soil-900">Actor id</dt>
            <dd className="break-all font-mono">{actor.id}</dd>
          </div>
          <div>
            <dt className="font-medium text-soil-900">DID</dt>
            <dd className="break-all font-mono">{actor.did}</dd>
          </div>
        </dl>
      </section>

      <p className="mt-8 text-xs text-soil-600">
        <Link href="/dashboard" className="underline">
          Back to dashboard
        </Link>
      </p>
    </main>
  );
}
