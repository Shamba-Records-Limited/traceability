// SPDX-License-Identifier: AGPL-3.0-or-later
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {PlotRegistry} from "../src/PlotRegistry.sol";

contract PlotRegistryTest is Test {
    PlotRegistry registry;
    bytes32 constant PLOT_ID = bytes32(uint256(0xabc));
    bytes32 constant PAYLOAD_HASH = bytes32(uint256(0xdeadbeef));
    bytes32 constant GEOMETRY_HASH = bytes32(uint256(0xfeedface));

    function setUp() public {
        registry = new PlotRegistry();
    }

    function test_attestPlot_recordsAttestation() public {
        vm.expectEmit(true, true, true, true);
        emit PlotRegistry.PlotAttested(
            PLOT_ID, PAYLOAD_HASH, GEOMETRY_HASH, address(this), uint64(block.timestamp)
        );
        registry.attestPlot(PLOT_ID, PAYLOAD_HASH, GEOMETRY_HASH);
        assertTrue(registry.isAttested(PLOT_ID));
    }

    function test_attestPlot_rejectsZeroId() public {
        vm.expectRevert(PlotRegistry.PlotIdZero.selector);
        registry.attestPlot(bytes32(0), PAYLOAD_HASH, GEOMETRY_HASH);
    }

    function test_attestPlot_rejectsDoubleAttestation() public {
        registry.attestPlot(PLOT_ID, PAYLOAD_HASH, GEOMETRY_HASH);
        vm.expectRevert(abi.encodeWithSelector(PlotRegistry.PlotAlreadyAttested.selector, PLOT_ID));
        registry.attestPlot(PLOT_ID, PAYLOAD_HASH, GEOMETRY_HASH);
    }

    function test_isAttested_falseForUnknown() public view {
        assertFalse(registry.isAttested(PLOT_ID));
    }
}
