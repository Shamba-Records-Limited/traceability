import { redirect } from 'next/navigation';

import { auth } from '../../../auth';
import { getActorForUser } from '../../../lib/actor';
import { listIncomingHandoffs, listOutgoingHandoffs } from '../../../lib/handoff';

import { HandoffActions } from './handoff-actions';

export const metadata = {
  title: 'Handoffs',
};

const STATUS_LABELS: Record<string, string> = {
  proposed: 'Proposed',
  in_transit: 'In transit',
  pending_receipt: 'Pending receipt',
  received: 'Received',
  disputed: 'Disputed',
  cancelled: 'Cancelled',
};

function statusClasses(status: string): string {
  switch (status) {
    case 'received':
      return 'bg-leaf-50 text-leaf-700';
    case 'cancelled':
    case 'disputed':
      return 'bg-red-50 text-red-700';
    default:
      return 'bg-soil-100 text-soil-700';
  }
}

export default async function HandoffsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/sign-in');

  const actor = await getActorForUser(session.user.id);
  if (!actor) redirect('/onboarding');

  const [outgoing, incoming] = await Promise.all([
    listOutgoingHandoffs(actor.id),
    listIncomingHandoffs(actor.id),
  ]);

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <header>
        <p className="text-sm font-medium uppercase tracking-widest text-leaf-600">
          Chain of custody
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-soil-900">Handoffs</h1>
        <p className="mt-2 text-sm text-soil-700">
          Two-party batch transfers between actors. The receiver must accept for the handoff to
          settle. When both sides have a Hedera account id on file, the HTS NFT transfers on-chain
          at acceptance time; otherwise the handoff settles in the off-chain log only and the
          on-chain transfer is queued for a follow-up reconciler.
        </p>
      </header>

      <section className="mt-10 rounded-md border border-soil-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-soil-900">Incoming</h2>
        <p className="mt-1 text-xs text-soil-600">
          Handoffs proposed to you. Accept to take custody.
        </p>
        {incoming.length === 0 ? (
          <p className="mt-4 text-sm text-soil-600">No incoming handoffs.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {incoming.map((h) => (
              <li key={h.id} className="rounded-md border border-soil-200 bg-soil-50 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-mono text-xs text-soil-500">{h.id}</p>
                    <p className="mt-1 text-sm font-semibold text-soil-900">
                      Batch <code className="font-mono">{h.batchId}</code>
                    </p>
                    <p className="mt-1 text-xs text-soil-700">
                      {h.quantity} {h.unit} from <code className="font-mono">{h.fromActorId}</code>
                    </p>
                    {h.notes ? (
                      <p className="mt-2 text-xs italic text-soil-600">&ldquo;{h.notes}&rdquo;</p>
                    ) : null}
                    <p className="mt-2 text-xs text-soil-600">
                      Proposed {h.proposedAt.toISOString().slice(0, 10)}
                      {h.receivedAt ? ` - received ${h.receivedAt.toISOString().slice(0, 10)}` : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusClasses(h.status)}`}
                    >
                      {STATUS_LABELS[h.status] ?? h.status}
                    </span>
                    {h.status === 'proposed' || h.status === 'pending_receipt' ? (
                      <HandoffActions handoffId={h.id} side="receiver" />
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8 rounded-md border border-soil-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-soil-900">Outgoing</h2>
        <p className="mt-1 text-xs text-soil-600">
          Handoffs you proposed. Cancel before the receiver accepts to abort.
        </p>
        {outgoing.length === 0 ? (
          <p className="mt-4 text-sm text-soil-600">No outgoing handoffs.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {outgoing.map((h) => (
              <li key={h.id} className="rounded-md border border-soil-200 bg-soil-50 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-mono text-xs text-soil-500">{h.id}</p>
                    <p className="mt-1 text-sm font-semibold text-soil-900">
                      Batch <code className="font-mono">{h.batchId}</code>
                    </p>
                    <p className="mt-1 text-xs text-soil-700">
                      {h.quantity} {h.unit} to <code className="font-mono">{h.toActorId}</code>
                    </p>
                    {h.notes ? (
                      <p className="mt-2 text-xs italic text-soil-600">&ldquo;{h.notes}&rdquo;</p>
                    ) : null}
                    <p className="mt-2 text-xs text-soil-600">
                      Proposed {h.proposedAt.toISOString().slice(0, 10)}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusClasses(h.status)}`}
                    >
                      {STATUS_LABELS[h.status] ?? h.status}
                    </span>
                    {h.status !== 'received' && h.status !== 'cancelled' ? (
                      <HandoffActions handoffId={h.id} side="sender" />
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
