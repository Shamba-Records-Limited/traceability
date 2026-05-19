// SPDX-License-Identifier: AGPL-3.0-or-later
pragma solidity 0.8.24;

/// @title PlotRegistry
/// @notice On-chain commitment registry for EUDR plot attestations. Each call
///         to `attestPlot` records a SHA-256 hash of the off-chain canonical
///         plot payload alongside a hash of the plot geometry. Auditors verify
///         a plot's record by hashing the off-chain payload and comparing to
///         the value stored here.
/// @dev    The contract is deliberately minimal: append-only, no payload
///         storage, no role-based access control. Authorization is governed
///         by the calling EOA's actor binding off-chain (the publisher
///         service signs with the operator's Hedera account, and the web
///         layer enforces "actor owns plot" before invoking the publisher).
///         A full RBAC layer can be layered on with a separate AccessControl
///         contract when the platform needs to revoke a custodian's writes
///         independently of its actor record.
///
///         Storage layout is two mappings keyed by the application's plot
///         UUID encoded as bytes32 (the UUID's 16 bytes left-aligned). This
///         gives auditors a single-call read path without iterating events.
contract PlotRegistry {
    /// @notice Recorded attestation for a single plot.
    /// @param payloadHash   SHA-256 of the off-chain canonical plot payload.
    /// @param geometryHash  SHA-256 of the GeoJSON geometry (lets auditors
    ///                      verify the geometry independently of the payload).
    /// @param attestedBy    EOA that submitted the attestation (the publisher
    ///                      service's Hedera operator account).
    /// @param attestedAt    Block timestamp the attestation was recorded.
    struct Attestation {
        bytes32 payloadHash;
        bytes32 geometryHash;
        address attestedBy;
        uint64 attestedAt;
    }

    /// @notice plotId (UUID as bytes32) -> attestation.
    mapping(bytes32 => Attestation) public attestations;

    /// @notice Emitted on every successful attestation. The off-chain
    ///         indexer reads this to backfill `plots.on_chain_registry_*`.
    event PlotAttested(
        bytes32 indexed plotId,
        bytes32 indexed payloadHash,
        bytes32 geometryHash,
        address indexed attestedBy,
        uint64 attestedAt
    );

    /// @notice Thrown when the caller attempts to attest a plot that already
    ///         has a record. Attestations are append-only; corrections are
    ///         handled via separate event types in the off-chain log.
    error PlotAlreadyAttested(bytes32 plotId);

    /// @notice Thrown when `plotId` is zero. Zero would collide with the
    ///         default-initialised mapping value and is never a legitimate
    ///         UUID.
    error PlotIdZero();

    /// @notice Record an attestation for `plotId`. Idempotent in the sense
    ///         that re-submitting the same record reverts with
    ///         `PlotAlreadyAttested` rather than producing a duplicate event;
    ///         the off-chain reconciler relies on this to be safe to retry.
    function attestPlot(bytes32 plotId, bytes32 payloadHash, bytes32 geometryHash) external {
        if (plotId == bytes32(0)) revert PlotIdZero();
        Attestation storage existing = attestations[plotId];
        if (existing.attestedAt != 0) revert PlotAlreadyAttested(plotId);

        uint64 ts = uint64(block.timestamp);
        attestations[plotId] = Attestation({
            payloadHash: payloadHash,
            geometryHash: geometryHash,
            attestedBy: msg.sender,
            attestedAt: ts
        });

        emit PlotAttested(plotId, payloadHash, geometryHash, msg.sender, ts);
    }

    /// @notice True iff `plotId` has been attested.
    function isAttested(bytes32 plotId) external view returns (bool) {
        return attestations[plotId].attestedAt != 0;
    }
}
