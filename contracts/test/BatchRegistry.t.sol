// SPDX-License-Identifier: AGPL-3.0-or-later
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {BatchRegistry} from "../src/BatchRegistry.sol";

contract BatchRegistryTest is Test {
    BatchRegistry registry;
    bytes32 constant BATCH_ID = bytes32(uint256(0xabc));
    bytes32 constant PAYLOAD_HASH = bytes32(uint256(0xdeadbeef));

    function setUp() public {
        registry = new BatchRegistry();
    }

    function test_recordBatch_withoutParents() public {
        bytes32[] memory parents = new bytes32[](0);
        vm.expectEmit(true, true, true, true);
        emit BatchRegistry.BatchRecorded(
            BATCH_ID, PAYLOAD_HASH, address(this), uint64(block.timestamp)
        );
        registry.recordBatch(BATCH_ID, PAYLOAD_HASH, parents);
        assertTrue(registry.isRecorded(BATCH_ID));
    }

    function test_recordBatch_emitsLineagePerParent() public {
        bytes32 p1 = bytes32(uint256(0x1));
        bytes32 p2 = bytes32(uint256(0x2));
        bytes32[] memory parents = new bytes32[](2);
        parents[0] = p1;
        parents[1] = p2;

        vm.recordLogs();
        registry.recordBatch(BATCH_ID, PAYLOAD_HASH, parents);
        // One BatchRecorded + two BatchLineage = three logs total.
        assertEq(vm.getRecordedLogs().length, 3);
    }

    function test_recordBatch_rejectsZeroId() public {
        bytes32[] memory parents = new bytes32[](0);
        vm.expectRevert(BatchRegistry.BatchIdZero.selector);
        registry.recordBatch(bytes32(0), PAYLOAD_HASH, parents);
    }

    function test_recordBatch_rejectsZeroParent() public {
        bytes32[] memory parents = new bytes32[](1);
        parents[0] = bytes32(0);
        vm.expectRevert(BatchRegistry.ParentIdZero.selector);
        registry.recordBatch(BATCH_ID, PAYLOAD_HASH, parents);
    }

    function test_recordBatch_rejectsDouble() public {
        bytes32[] memory parents = new bytes32[](0);
        registry.recordBatch(BATCH_ID, PAYLOAD_HASH, parents);
        vm.expectRevert(
            abi.encodeWithSelector(BatchRegistry.BatchAlreadyRecorded.selector, BATCH_ID)
        );
        registry.recordBatch(BATCH_ID, PAYLOAD_HASH, parents);
    }
}
