// N-API bindings for libcma Ether MVP.
// Host: native/mock (behavioral).
// riscv64: native/real linked against libcma.a (proof-identical).

#include <cstdio>
#include <cstring>
#include <string>

#include <napi.h>

#include "ledger_backend.h"

namespace {

Napi::Error ledger_error(Napi::Env env, int rc, const char *what) {
    const char *detail = cma_node_last_error();
    char msg[256];
    std::snprintf(msg, sizeof msg, "%s failed (%d)%s%s", what, rc,
        (detail && detail[0]) ? ": " : "", (detail && detail[0]) ? detail : "");
    Napi::Error err = Napi::Error::New(env, msg);
    err.Set("code", Napi::Number::New(env, rc));
    err.Set("syscall", Napi::String::New(env, what));
    return err;
}

bool read_address(Napi::Env env, const Napi::Value &value, uint8_t out[20]) {
    if (!value.IsTypedArray() || value.As<Napi::TypedArray>().TypedArrayType() != napi_uint8_array) {
        Napi::TypeError::New(env, "address must be a Uint8Array of 20 bytes").ThrowAsJavaScriptException();
        return false;
    }
    auto arr = value.As<Napi::Uint8Array>();
    if (arr.ByteLength() != 20) {
        Napi::TypeError::New(env, "address must be exactly 20 bytes").ThrowAsJavaScriptException();
        return false;
    }
    std::memcpy(out, arr.Data(), 20);
    return true;
}

bool read_u256(Napi::Env env, const Napi::Value &value, uint8_t out[32]) {
    if (!value.IsBigInt()) {
        Napi::TypeError::New(env, "amount must be a bigint").ThrowAsJavaScriptException();
        return false;
    }
    std::memset(out, 0, 32);
    int sign = 0;
    size_t word_count = 4;
    uint64_t words[4] = {0, 0, 0, 0};
    value.As<Napi::BigInt>().ToWords(&sign, &word_count, words);
    if (sign != 0) {
        Napi::RangeError::New(env, "amount must be non-negative").ThrowAsJavaScriptException();
        return false;
    }
    for (size_t w = 0; w < word_count && w < 4; w++) {
        uint64_t word = words[w];
        for (int b = 0; b < 8; b++) {
            size_t idx = 31 - (w * 8 + static_cast<size_t>(b));
            out[idx] = static_cast<uint8_t>(word & 0xff);
            word >>= 8;
        }
    }
    return true;
}

Napi::BigInt u256_to_bigint(Napi::Env env, const uint8_t amount[32]) {
    uint64_t words[4] = {0, 0, 0, 0};
    for (size_t w = 0; w < 4; w++) {
        uint64_t word = 0;
        for (int b = 0; b < 8; b++) {
            size_t idx = 31 - (w * 8 + static_cast<size_t>(b));
            word |= static_cast<uint64_t>(amount[idx]) << (8 * b);
        }
        words[w] = word;
    }
    return Napi::BigInt::New(env, 0, 4, words);
}

class LedgerWrap : public Napi::ObjectWrap<LedgerWrap> {
public:
    static Napi::FunctionReference constructor;

    static Napi::Object Init(Napi::Env env, Napi::Object exports) {
        Napi::Function func = DefineClass(env, "NativeLedger",
            {
                InstanceMethod("depositEther", &LedgerWrap::DepositEther),
                InstanceMethod("transferEther", &LedgerWrap::TransferEther),
                InstanceMethod("withdrawEther", &LedgerWrap::WithdrawEther),
                InstanceMethod("getEtherBalance", &LedgerWrap::GetEtherBalance),
                InstanceMethod("close", &LedgerWrap::Close),
                InstanceAccessor("kind", &LedgerWrap::Kind, nullptr),
            });
        constructor = Napi::Persistent(func);
        constructor.SuppressDestruct();

        exports.Set("NativeLedger", func);
        exports.Set("openEtherBuffer", Napi::Function::New(env, OpenEtherBuffer));
        exports.Set("openEtherFile", Napi::Function::New(env, OpenEtherFile));
        return exports;
    }

    explicit LedgerWrap(const Napi::CallbackInfo &info) : Napi::ObjectWrap<LedgerWrap>(info) {}

    ~LedgerWrap() override {
        CloseInternal();
    }

    void Attach(CmaNodeLedger *ledger) {
        ledger_ = ledger;
    }

private:
    static Napi::Value OpenEtherBuffer(const Napi::CallbackInfo &info) {
        Napi::Env env = info.Env();
        if (info.Length() < 1 || !info[0].IsNumber()) {
            Napi::TypeError::New(env, "openEtherBuffer(maxAccounts)").ThrowAsJavaScriptException();
            return env.Null();
        }
        size_t max_accounts = info[0].As<Napi::Number>().Uint32Value();
        CmaNodeLedger *ledger = cma_node_open_buffer(max_accounts);
        if (!ledger) {
            ledger_error(env, -1001, "openEtherBuffer").ThrowAsJavaScriptException();
            return env.Null();
        }
        Napi::Object obj = constructor.New({});
        LedgerWrap::Unwrap(obj)->Attach(ledger);
        return obj;
    }

    static Napi::Value OpenEtherFile(const Napi::CallbackInfo &info) {
        Napi::Env env = info.Env();
        if (info.Length() < 4 || !info[0].IsString() || !info[1].IsNumber() || !info[2].IsNumber() ||
            !info[3].IsNumber()) {
            Napi::TypeError::New(env, "openEtherFile(path, offset, memoryLength, maxAccounts)")
                .ThrowAsJavaScriptException();
            return env.Null();
        }
        std::string path = info[0].As<Napi::String>().Utf8Value();
        size_t offset = static_cast<size_t>(info[1].As<Napi::Number>().Int64Value());
        size_t memory_length = static_cast<size_t>(info[2].As<Napi::Number>().Int64Value());
        size_t max_accounts = info[3].As<Napi::Number>().Uint32Value();
        CmaNodeLedger *ledger = cma_node_open_file(path.c_str(), offset, memory_length, max_accounts);
        if (!ledger) {
            ledger_error(env, -1001, "openEtherFile").ThrowAsJavaScriptException();
            return env.Null();
        }
        Napi::Object obj = constructor.New({});
        LedgerWrap::Unwrap(obj)->Attach(ledger);
        return obj;
    }

    void CloseInternal() {
        if (ledger_) {
            cma_node_close(ledger_);
            ledger_ = nullptr;
        }
    }

    bool Ensure(Napi::Env env) {
        if (!ledger_) {
            ledger_error(env, -1001, "ledger").ThrowAsJavaScriptException();
            return false;
        }
        return true;
    }

    void DepositEther(const Napi::CallbackInfo &info) {
        Napi::Env env = info.Env();
        if (!Ensure(env)) {
            return;
        }
        if (info.Length() < 2) {
            Napi::TypeError::New(env, "depositEther(account, amount)").ThrowAsJavaScriptException();
            return;
        }
        uint8_t addr[20];
        uint8_t amount[32];
        if (!read_address(env, info[0], addr) || !read_u256(env, info[1], amount)) {
            return;
        }
        int rc = cma_node_deposit_ether(ledger_, addr, amount);
        if (rc < 0) {
            ledger_error(env, rc, "depositEther").ThrowAsJavaScriptException();
        }
    }

    void TransferEther(const Napi::CallbackInfo &info) {
        Napi::Env env = info.Env();
        if (!Ensure(env)) {
            return;
        }
        if (info.Length() < 3) {
            Napi::TypeError::New(env, "transferEther(from, to, amount)").ThrowAsJavaScriptException();
            return;
        }
        uint8_t from[20];
        uint8_t to[20];
        uint8_t amount[32];
        if (!read_address(env, info[0], from) || !read_address(env, info[1], to) || !read_u256(env, info[2], amount)) {
            return;
        }
        int rc = cma_node_transfer_ether(ledger_, from, to, amount);
        if (rc < 0) {
            ledger_error(env, rc, "transferEther").ThrowAsJavaScriptException();
        }
    }

    void WithdrawEther(const Napi::CallbackInfo &info) {
        Napi::Env env = info.Env();
        if (!Ensure(env)) {
            return;
        }
        if (info.Length() < 2) {
            Napi::TypeError::New(env, "withdrawEther(account, amount)").ThrowAsJavaScriptException();
            return;
        }
        uint8_t addr[20];
        uint8_t amount[32];
        if (!read_address(env, info[0], addr) || !read_u256(env, info[1], amount)) {
            return;
        }
        int rc = cma_node_withdraw_ether(ledger_, addr, amount);
        if (rc < 0) {
            ledger_error(env, rc, "withdrawEther").ThrowAsJavaScriptException();
        }
    }

    Napi::Value GetEtherBalance(const Napi::CallbackInfo &info) {
        Napi::Env env = info.Env();
        if (!Ensure(env)) {
            return env.Null();
        }
        if (info.Length() < 1) {
            Napi::TypeError::New(env, "getEtherBalance(account)").ThrowAsJavaScriptException();
            return env.Null();
        }
        uint8_t addr[20];
        uint8_t amount[32];
        if (!read_address(env, info[0], addr)) {
            return env.Null();
        }
        int rc = cma_node_get_ether_balance(ledger_, addr, amount);
        if (rc < 0) {
            ledger_error(env, rc, "getEtherBalance").ThrowAsJavaScriptException();
            return env.Null();
        }
        return u256_to_bigint(env, amount);
    }

    void Close(const Napi::CallbackInfo &) {
        CloseInternal();
    }

    Napi::Value Kind(const Napi::CallbackInfo &info) {
        return Napi::String::New(info.Env(), cma_node_kind());
    }

    CmaNodeLedger *ledger_ = nullptr;
};

Napi::FunctionReference LedgerWrap::constructor;

Napi::Object InitAll(Napi::Env env, Napi::Object exports) {
    return LedgerWrap::Init(env, exports);
}

} // namespace

NODE_API_MODULE(libcma, InitAll)
