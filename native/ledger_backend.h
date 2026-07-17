#pragma once

#include <cstddef>
#include <cstdint>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct CmaNodeLedger CmaNodeLedger;

CmaNodeLedger *cma_node_open_buffer(size_t max_accounts);
CmaNodeLedger *cma_node_open_file(const char *path, size_t offset, size_t memory_length, size_t max_accounts);
void cma_node_close(CmaNodeLedger *ledger);

int cma_node_deposit_ether(CmaNodeLedger *ledger, const uint8_t account[20], const uint8_t amount_be[32]);
int cma_node_transfer_ether(CmaNodeLedger *ledger, const uint8_t from[20], const uint8_t to[20],
    const uint8_t amount_be[32]);
int cma_node_withdraw_ether(CmaNodeLedger *ledger, const uint8_t account[20], const uint8_t amount_be[32]);
int cma_node_get_ether_balance(CmaNodeLedger *ledger, const uint8_t account[20], uint8_t out_amount_be[32]);

const char *cma_node_last_error(void);
/** "native-mock" on host, "native-libcma" when linked to real libcma. */
const char *cma_node_kind(void);

#ifdef __cplusplus
}
#endif
