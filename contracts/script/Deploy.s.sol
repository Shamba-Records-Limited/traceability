// SPDX-License-Identifier: AGPL-3.0-or-later
pragma solidity 0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {PlotRegistry} from "../src/PlotRegistry.sol";
import {BatchRegistry} from "../src/BatchRegistry.sol";

/// @title Deploy
/// @notice Deploys PlotRegistry + BatchRegistry to whichever EVM RPC the
///         FOUNDRY_RPC_URL env var points at. Intended for Hedera testnet
///         (HashIO relay or the operator's own relay). The deployer EOA is
///         derived from PRIVATE_KEY in the standard Foundry way.
///
///         After a successful deploy, print the Hedera contract IDs in
///         `0.0.<num>` form so the addresses can be pasted into the
///         publisher's HEDERA_PLOT_REGISTRY_ID / HEDERA_BATCH_REGISTRY_ID
///         envvars without manual translation.
contract Deploy is Script {
    function run() external {
        vm.startBroadcast();
        PlotRegistry plot = new PlotRegistry();
        BatchRegistry batch = new BatchRegistry();
        vm.stopBroadcast();

        console.log("PlotRegistry EVM address: %s", address(plot));
        console.log("BatchRegistry EVM address: %s", address(batch));
        console.log(
            "Convert each to Hedera 0.0.<num> via the mirror node: GET /api/v1/contracts/<address>"
        );
    }
}
