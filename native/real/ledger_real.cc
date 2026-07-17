// Real libcma backend (riscv64 / LIBCMA_USE_REAL).
// Uses cma_ledger_init_single_* with AssetType::BASE (Ether) — matches contracts v3
// emergency-withdrawal accounts-drive layout (32-byte single-asset records).

#include "ledger_backend.h"

#include <cstdlib>
#include <cstring>
#include <new>
#include <string>

extern "C" {
#include <libcma/ledger.h>
#include <libcma/types.h>
}

namespace {

thread_local std::string g_last_error;

void set_err(const char *msg) {
    g_last_error = msg ? msg : "";
}

void set_err_from_libcma() {
    const char *msg = cma_ledger_get_last_error_message();
    g_last_error = msg ? msg : "libcma error";
}

bool amount_is_zero(const uint8_t amount_be[32]) {
    for (int i = 0; i < 32; i++) {
        if (amount_be[i] != 0) {
            return false;
        }
    }
    return true;
}

void copy_amount(cma_amount_t *dst, const uint8_t amount_be[32]) {
    std::memcpy(dst->data, amount_be, 32);
}

void copy_amount_out(uint8_t out[32], const cma_amount_t *src) {
    std::memcpy(out, src->data, 32);
}

int resolve_account(cma_ledger_t *ledger, const uint8_t account[20], cma_ledger_account_id_t *out_id,
    cma_ledger_retrieve_operation_t op) {
    cma_ledger_account_id_t account_id = 0;
    cma_ledger_account_t account_obj{};
    cma_ledger_account_type_t account_type = CMA_LEDGER_ACCOUNT_TYPE_WALLET_ADDRESS;
    int rc = cma_ledger_retrieve_account(ledger, &account_id, &account_obj, account, nullptr, &account_type, op);
    if (rc < 0) {
        set_err_from_libcma();
        return rc;
    }
    *out_id = account_id;
    return CMA_LEDGER_SUCCESS;
}

} // namespace

struct CmaNodeLedger {
    cma_ledger_t ledger{};
    void *owned_buffer = nullptr;
    size_t owned_length = 0;
    bool open = false;
};

extern "C" {

CmaNodeLedger *cma_node_open_buffer(size_t max_accounts) {
    // Single-asset estimate grows with account capacity; 4 MiB covers the default
    // log2_max_num_of_accounts=17 drive and is safe for smaller capacities.
    constexpr size_t kDefaultMem = 4u * 1024u * 1024u;
    size_t mem_length = kDefaultMem;
    if (max_accounts <= 256) {
        mem_length = CMA_LEDGER_MIN_MEM_LENGTH;
    }

    void *buffer = std::calloc(1, mem_length);
    if (!buffer) {
        set_err("out of memory");
        return nullptr;
    }

    auto *node = new (std::nothrow) CmaNodeLedger();
    if (!node) {
        std::free(buffer);
        set_err("out of memory");
        return nullptr;
    }

    int rc = cma_ledger_init_single_buffer(&node->ledger, buffer, mem_length, max_accounts,
        CMA_LEDGER_ASSET_TYPE_BASE, nullptr);
    if (rc < 0) {
        set_err_from_libcma();
        std::free(buffer);
        delete node;
        return nullptr;
    }

    node->owned_buffer = buffer;
    node->owned_length = mem_length;
    node->open = true;
    g_last_error.clear();
    return node;
}

CmaNodeLedger *cma_node_open_file(const char *path, size_t offset, size_t memory_length, size_t max_accounts) {
    if (!path || memory_length == 0 || max_accounts == 0) {
        set_err("invalid open_file arguments");
        return nullptr;
    }

    auto *node = new (std::nothrow) CmaNodeLedger();
    if (!node) {
        set_err("out of memory");
        return nullptr;
    }

    int rc = cma_ledger_init_single_file(&node->ledger, path, offset, memory_length, max_accounts,
        CMA_LEDGER_ASSET_TYPE_BASE, nullptr);
    if (rc < 0) {
        set_err_from_libcma();
        delete node;
        return nullptr;
    }

    node->open = true;
    g_last_error.clear();
    return node;
}

void cma_node_close(CmaNodeLedger *ledger) {
    if (!ledger) {
        return;
    }
    if (ledger->open) {
        (void) cma_ledger_fini(&ledger->ledger);
        ledger->open = false;
    }
    if (ledger->owned_buffer) {
        std::free(ledger->owned_buffer);
        ledger->owned_buffer = nullptr;
    }
    delete ledger;
}

int cma_node_deposit_ether(CmaNodeLedger *ledger, const uint8_t account[20], const uint8_t amount_be[32]) {
    if (!ledger || !ledger->open) {
        set_err("ledger closed");
        return CMA_LEDGER_ERROR_UNKNOWN;
    }
    if (amount_is_zero(amount_be)) {
        return CMA_LEDGER_SUCCESS;
    }

    cma_ledger_account_id_t account_id = 0;
    int rc = resolve_account(&ledger->ledger, account, &account_id, CMA_LEDGER_OP_FIND_OR_CREATE);
    if (rc < 0) {
        return rc;
    }

    cma_amount_t amount{};
    copy_amount(&amount, amount_be);
    // Single-asset Ether ledger: fixed asset id 0.
    rc = cma_ledger_deposit(&ledger->ledger, 0, account_id, &amount);
    if (rc < 0) {
        set_err_from_libcma();
        return rc;
    }
    return CMA_LEDGER_SUCCESS;
}

int cma_node_transfer_ether(CmaNodeLedger *ledger, const uint8_t from[20], const uint8_t to[20],
    const uint8_t amount_be[32]) {
    if (!ledger || !ledger->open) {
        set_err("ledger closed");
        return CMA_LEDGER_ERROR_UNKNOWN;
    }
    if (amount_is_zero(amount_be)) {
        return CMA_LEDGER_SUCCESS;
    }

    cma_ledger_account_id_t from_id = 0;
    cma_ledger_account_id_t to_id = 0;
    int rc = resolve_account(&ledger->ledger, from, &from_id, CMA_LEDGER_OP_FIND);
    if (rc < 0) {
        return rc;
    }
    rc = resolve_account(&ledger->ledger, to, &to_id, CMA_LEDGER_OP_FIND_OR_CREATE);
    if (rc < 0) {
        return rc;
    }

    cma_amount_t amount{};
    copy_amount(&amount, amount_be);
    rc = cma_ledger_transfer(&ledger->ledger, 0, from_id, to_id, &amount);
    if (rc < 0) {
        set_err_from_libcma();
        return rc;
    }
    return CMA_LEDGER_SUCCESS;
}

int cma_node_withdraw_ether(CmaNodeLedger *ledger, const uint8_t account[20], const uint8_t amount_be[32]) {
    if (!ledger || !ledger->open) {
        set_err("ledger closed");
        return CMA_LEDGER_ERROR_UNKNOWN;
    }
    if (amount_is_zero(amount_be)) {
        return CMA_LEDGER_SUCCESS;
    }

    cma_ledger_account_id_t account_id = 0;
    int rc = resolve_account(&ledger->ledger, account, &account_id, CMA_LEDGER_OP_FIND);
    if (rc < 0) {
        return rc;
    }

    cma_amount_t amount{};
    copy_amount(&amount, amount_be);
    rc = cma_ledger_withdraw(&ledger->ledger, 0, account_id, &amount);
    if (rc < 0) {
        set_err_from_libcma();
        return rc;
    }
    return CMA_LEDGER_SUCCESS;
}

int cma_node_get_ether_balance(CmaNodeLedger *ledger, const uint8_t account[20], uint8_t out_amount_be[32]) {
    if (!ledger || !ledger->open) {
        set_err("ledger closed");
        return CMA_LEDGER_ERROR_UNKNOWN;
    }

    cma_ledger_account_id_t account_id = 0;
    int rc = resolve_account(&ledger->ledger, account, &account_id, CMA_LEDGER_OP_FIND);
    if (rc < 0) {
        // Missing account → zero balance (matches memory backend semantics).
        if (rc == CMA_LEDGER_ERROR_ACCOUNT_NOT_FOUND) {
            std::memset(out_amount_be, 0, 32);
            return CMA_LEDGER_SUCCESS;
        }
        return rc;
    }

    cma_amount_t balance{};
    rc = cma_ledger_get_balance(&ledger->ledger, 0, account_id, &balance, nullptr);
    if (rc < 0) {
        if (rc == CMA_LEDGER_ERROR_BALANCE_NOT_FOUND) {
            std::memset(out_amount_be, 0, 32);
            return CMA_LEDGER_SUCCESS;
        }
        set_err_from_libcma();
        return rc;
    }
    copy_amount_out(out_amount_be, &balance);
    return CMA_LEDGER_SUCCESS;
}

const char *cma_node_last_error(void) {
    return g_last_error.c_str();
}

const char *cma_node_kind(void) {
    return "native-libcma";
}

} // extern "C"
