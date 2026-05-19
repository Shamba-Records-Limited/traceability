import { and, eq, inArray } from 'drizzle-orm';

import { schema } from '@shamba/db';

import { db } from '../../../../../../lib/db';
import { requireApiKey } from '../../../../../../lib/api-auth';

const { batches, batchParents } = schema;

/**
 * GET /api/v1/batches/:id/lineage
 *
 * Multi-hop lineage graph (parents + children) for a batch, returned
 * as an adjacency list. Capped at `MAX_NODES` nodes to bound memory
 * for deep / wide graphs; integrators that need more should paginate
 * by walking adjacencies themselves.
 *
 * Scopes: `lineage:read`.
 */
const MAX_NODES = 500;

interface NodeRef {
  id: string;
  commodity: string;
  processingStage: string;
  status: string;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await requireApiKey(request, 'lineage:read');
  if (auth.kind === 'response') return auth.response;

  const { id: rootId } = await context.params;
  if (!/^[0-9a-f-]{32,36}$/i.test(rootId)) {
    return Response.json({ error: 'not_found' }, { status: 404 });
  }

  // Verify ownership of the root batch — otherwise return 404 so we
  // don't leak existence via lineage.
  const [own] = await db
    .select({ id: batches.id })
    .from(batches)
    .where(and(eq(batches.id, rootId), eq(batches.custodianActorId, auth.key.actorId)))
    .limit(1);
  if (!own) return Response.json({ error: 'not_found' }, { status: 404 });

  const visited = new Set<string>([rootId]);
  const edges: Array<{ child: string; parent: string }> = [];
  const nodesById = new Map<string, NodeRef>();
  // BFS upstream (parents) then downstream (children).
  let frontier: string[] = [rootId];
  let truncated = false;

  // Bound the traversal so a pathological graph cannot exhaust
  // memory. Two directions, each capped at MAX_NODES.
  for (let direction = 0; direction < 2 && frontier.length > 0 && !truncated; direction += 1) {
    const isUpstream = direction === 0;
    let current = frontier;
    while (current.length > 0 && !truncated) {
      const adjRows = isUpstream
        ? await db
            .select({ child: batchParents.childBatchId, parent: batchParents.parentBatchId })
            .from(batchParents)
            .where(inArray(batchParents.childBatchId, current))
        : await db
            .select({ child: batchParents.childBatchId, parent: batchParents.parentBatchId })
            .from(batchParents)
            .where(inArray(batchParents.parentBatchId, current));

      const next = new Set<string>();
      for (const row of adjRows) {
        edges.push({ child: row.child, parent: row.parent });
        const other = isUpstream ? row.parent : row.child;
        if (!visited.has(other)) {
          if (visited.size >= MAX_NODES) {
            truncated = true;
            break;
          }
          visited.add(other);
          next.add(other);
        }
      }
      current = Array.from(next);
    }
    frontier = isUpstream ? [rootId] : [];
  }

  if (visited.size > 0) {
    const nodes = await db
      .select({
        id: batches.id,
        commodity: batches.commodity,
        processingStage: batches.processingStage,
        status: batches.status,
      })
      .from(batches)
      .where(inArray(batches.id, Array.from(visited)));
    for (const n of nodes) {
      nodesById.set(n.id, {
        id: n.id,
        commodity: n.commodity,
        processingStage: n.processingStage,
        status: n.status,
      });
    }
  }

  return Response.json({
    rootBatchId: rootId,
    nodes: Array.from(nodesById.values()),
    edges,
    truncated,
    maxNodes: MAX_NODES,
  });
}
