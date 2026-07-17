// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.8;

/// @notice Matches contracts-v3 LibUsdAccount / TestUsd leaf layout used by
/// single-asset libcma Ether ledgers (`log2_leaves_per_account = 0`):
///   bytes[0:8]  = balance (uint64 little-endian)
///   bytes[8:28] = owner address
/// Unlike TestUsdWithdrawalOutputBuilder, this emits an Ether voucher so the
/// Application transfers native ETH rather than TestToken.

interface IWithdrawalOutputBuilder {
    function buildWithdrawalOutput(address appContract, bytes calldata account)
        external
        view
        returns (bytes memory output);
}

interface Outputs {
    function Voucher(address destination, uint256 value, bytes calldata payload) external;
}

contract EtherWithdrawalOutputBuilder is IWithdrawalOutputBuilder {
    uint64 internal constant MIN_ACCOUNT_SIZE = 28;

    function buildWithdrawalOutput(address, bytes calldata account)
        external
        pure
        override
        returns (bytes memory output)
    {
        require(account.length >= MIN_ACCOUNT_SIZE, "Account is too short");

        address user = address(uint160(bytes20(account[8:28])));
        uint64 balance;
        for (uint256 i; i < 8; ++i) {
            balance |= uint64(uint256(uint8(account[i])) << (8 * i));
        }

        return abi.encodeCall(Outputs.Voucher, (user, uint256(balance), ""));
    }
}
