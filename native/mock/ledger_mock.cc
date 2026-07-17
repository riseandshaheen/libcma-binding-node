// Host behavioral mock — NOT proof-identical to C++ libcma.

#include "ledger_backend.h"

#include <cstring>
#include <map>
#include <string>

namespace {

constexpr int kSuccess = 0;
constexpr int kUnknown = -1001;
constexpr int kInsufficientFunds = -1003;
constexpr int kMaxAccounts = -1012;

struct MockState {
    std::map<std::string, __uint128_t> balances;
    size_t max_accounts = 0;
    bool open = false;
};

std::string key_of(const uint8_t *addr) {
    static const char *hex = "0123456789abcdef";
    std::string out(40, '0');
    for (int i = 0; i < 20; i++) {
        out[size_t(i) * 2] = hex[addr[i] >> 4];
        out[size_t(i) * 2 + 1] = hex[addr[i] & 0xf];
    }
    return out;
}

__uint128_t u256_be_to_u128(const uint8_t amount[32]) {
    for (int i = 0; i < 16; i++) {
        if (amount[i] != 0) {
            return ~__uint128_t{0};
        }
    }
    __uint128_t v = 0;
    for (int i = 16; i < 32; i++) {
        v = (v << 8) | amount[i];
    }
    return v;
}

void u128_to_u256_be(__uint128_t v, uint8_t out[32]) {
    std::memset(out, 0, 32);
    for (int i = 31; i >= 16; i--) {
        out[i] = static_cast<uint8_t>(v & 0xff);
        v >>= 8;
    }
}

thread_local std::string g_last_error;

} // namespace

struct CmaNodeLedger {
    MockState state;
};

extern "C" {

CmaNodeLedger *cma_node_open_buffer(size_t max_accounts) {
    auto *ledger = new CmaNodeLedger();
    ledger->state.max_accounts = max_accounts;
    ledger->state.open = true;
    g_last_error.clear();
    return ledger;
}

CmaNodeLedger *cma_node_open_file(const char * /*path*/, size_t /*offset*/, size_t /*memory_length*/,
    size_t max_accounts) {
    return cma_node_open_buffer(max_accounts);
}

void cma_node_close(CmaNodeLedger *ledger) {
    delete ledger;
}

int cma_node_deposit_ether(CmaNodeLedger *ledger, const uint8_t account[20], const uint8_t amount_be[32]) {
    if (!ledger || !ledger->state.open) {
        g_last_error = "ledger closed";
        return kUnknown;
    }
    __uint128_t amount = u256_be_to_u128(amount_be);
    if (amount == 0) {
        return kSuccess;
    }
    auto key = key_of(account);
    auto it = ledger->state.balances.find(key);
    if (it == ledger->state.balances.end()) {
        if (ledger->state.balances.size() >= ledger->state.max_accounts) {
            g_last_error = "max accounts reached";
            return kMaxAccounts;
        }
        ledger->state.balances.emplace(key, amount);
    } else {
        it->second += amount;
    }
    return kSuccess;
}

int cma_node_transfer_ether(CmaNodeLedger *ledger, const uint8_t from[20], const uint8_t to[20],
    const uint8_t amount_be[32]) {
    if (!ledger || !ledger->state.open) {
        g_last_error = "ledger closed";
        return kUnknown;
    }
    __uint128_t amount = u256_be_to_u128(amount_be);
    if (amount == 0) {
        return kSuccess;
    }
    auto from_key = key_of(from);
    auto to_key = key_of(to);
    auto from_it = ledger->state.balances.find(from_key);
    __uint128_t bal = from_it == ledger->state.balances.end() ? 0 : from_it->second;
    if (bal < amount) {
        g_last_error = "insufficient funds";
        return kInsufficientFunds;
    }
    if (to_key != from_key) {
        auto to_it = ledger->state.balances.find(to_key);
        if (to_it == ledger->state.balances.end() &&
            ledger->state.balances.size() >= ledger->state.max_accounts) {
            g_last_error = "max accounts reached";
            return kMaxAccounts;
        }
    }
    from_it->second = bal - amount;
    if (from_it->second == 0) {
        ledger->state.balances.erase(from_it);
    }
    auto to_it = ledger->state.balances.find(to_key);
    if (to_it == ledger->state.balances.end()) {
        ledger->state.balances.emplace(to_key, amount);
    } else {
        to_it->second += amount;
    }
    return kSuccess;
}

int cma_node_withdraw_ether(CmaNodeLedger *ledger, const uint8_t account[20], const uint8_t amount_be[32]) {
    if (!ledger || !ledger->state.open) {
        g_last_error = "ledger closed";
        return kUnknown;
    }
    __uint128_t amount = u256_be_to_u128(amount_be);
    if (amount == 0) {
        return kSuccess;
    }
    auto key = key_of(account);
    auto it = ledger->state.balances.find(key);
    __uint128_t bal = it == ledger->state.balances.end() ? 0 : it->second;
    if (bal < amount) {
        g_last_error = "insufficient funds";
        return kInsufficientFunds;
    }
    it->second = bal - amount;
    if (it->second == 0) {
        ledger->state.balances.erase(it);
    }
    return kSuccess;
}

int cma_node_get_ether_balance(CmaNodeLedger *ledger, const uint8_t account[20], uint8_t out_amount_be[32]) {
    if (!ledger || !ledger->state.open) {
        g_last_error = "ledger closed";
        return kUnknown;
    }
    auto key = key_of(account);
    auto it = ledger->state.balances.find(key);
    __uint128_t bal = it == ledger->state.balances.end() ? 0 : it->second;
    u128_to_u256_be(bal, out_amount_be);
    return kSuccess;
}

const char *cma_node_last_error(void) {
    return g_last_error.c_str();
}

const char *cma_node_kind(void) {
    return "native-mock";
}

} // extern "C"
