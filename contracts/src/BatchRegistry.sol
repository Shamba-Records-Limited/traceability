// SPDX-License-Identifier: AGPL-3.0-or-later
pragma solidity 0.8.24;

/// @title BatchRegistry
/// @notice On-chain commitment registry for batch creation and lineage. Each
///         `recordBatch` call commits a SHA-256 hash of the off-chain
///         canonical batch payload plus the IDs of any parent batches that
///         this batch was split or merged from. Lineage edges are recorded
///         in the same transaction so auditors can walk the full graph by
///         reading events.
/// @dev    Append-only, mirroring PlotRegistry. Authorization is enforced
///         off-chain (the web layer asserts custodian ownership of the
///         source plots + parent batches before calling the publisher).
contract BatchRegistry {
    /// @notice Recorded batch metadata.
    /// @param payloadHash   SHA-256 of the off-chain canonical batch payload
    ///                      (commodity, processing stage, quantity, source
    ///                      plot ids, parent batch ids, etc.).
    /// @param custodian     EOA that submitted the record (publisher's Hedera
    ///                      operator account).
    /// @param recordedAt    Block timestamp.
    struct BatchRecord {
        bytes32 payloadHash;
        address custodian;
        uint64 recordedAt;
    }

    /// @notice batchId (UUID as bytes32) -> record.
    mapping(bytes32 => BatchRecord) public records;

    /// @notice Emitted on every batch record. The off-chain indexer joins
    ///         these against `batches.on_chain_registry_tx_id` to compose
    ///         the audit-trail bundle for an importer.
    event BatchRecorded(
        bytes32 indexed batchId,
        bytes32 indexed payloadHash,
        address indexed custodian,
        uint64 recordedAt
    );

    /// @notice Emitted once per (child, parent) lineage edge. Two parents
    ///         emit two events; this keeps the indexer's join cardinality
    ///         linear instead of scanning a nested struct.
    event BatchLineage(bytes32 indexed childBatchId, bytes32 indexed parentBatchId);

    error BatchAlreadyRecorded(bytes32 batchId);
    error BatchIdZero();
    /// @notice At least one parent id was zero. Zero is never a legitimate
    ///         UUID and would otherwise leave a half-attached edge.
    error ParentIdZero();

    /// @notice Record a batch. Re-submitting the same `batchId` reverts with
    ///         `BatchAlreadyRecorded`; reconcilers depend on this to retry
    ///         idempotently.
    function recordBatch(
        bytes32 batchId,
        bytes32 payloadHash,
        bytes32[] calldata parentBatchIds
    ) external {
        if (batchId == bytes32(0)) revert BatchIdZero();
        BatchRecord storage existing = records[batchId];
        if (existing.recordedAt != 0) revert BatchAlreadyRecorded(batchId);

        uint64 ts = uint64(block.timestamp);
        records[batchId] = BatchRecord({
            payloadHash: payloadHash,
            custodian: msg.sender,
            recordedAt: ts
        });

        emit BatchRecorded(batchId, payloadHash, msg.sender, ts);

        uint256 n = parentBatchIds.length;
        for (uint256 i = 0; i < n; i++) {
            bytes32 parentId = parentBatchIds[i];
            if (parentId == bytes32(0)) revert ParentIdZero();
            emit BatchLineage(batchId, parentId);
        }
    }

    /// @notice True iff `batchId` has been recorded.
    function isRecorded(bytes32 batchId) external view returns (bool) {
        return records[batchId].recordedAt != 0;
    }
}
