{
  "variables": {
    "libcma_include%": "<!(node -p \"process.env.LIBCMA_INCLUDE || 'deps/machine-asset-tools/include'\")",
    "libcmt_include%": "<!(node -p \"process.env.LIBCMT_INCLUDE || 'deps/machine-guest-tools/sys-utils/libcmt/include'\")",
    "libcma_lib_dir%": "<!(node -p \"process.env.LIBCMA_LIB_DIR || 'deps/machine-asset-tools/build/riscv64'\")",
    "libcma_use_real%": "<!(node -p \"(process.env.LIBCMA_FORCE_REAL === '1' || process.arch === 'riscv64') ? 1 : 0\")"
  },
  "targets": [
    {
      "target_name": "libcma_napi",
      "sources": ["native/addon.cc"],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include_dir\")",
        "<(libcma_include)",
        "<(libcmt_include)",
        "native"
      ],
      "defines": [
        "NAPI_VERSION=8",
        "NAPI_DISABLE_CPP_EXCEPTIONS",
        "NODE_ADDON_API_DISABLE_DEPRECATED"
      ],
      "cflags!": ["-fno-exceptions"],
      "cflags_cc!": ["-fno-exceptions"],
      "cflags": ["-O2", "-fno-strict-aliasing", "-fno-strict-overflow"],
      "cflags_cc": ["-std=c++20"],
      "xcode_settings": {
        "CLANG_CXX_LANGUAGE_STANDARD": "c++20",
        "MACOSX_DEPLOYMENT_TARGET": "11.0",
        "GCC_ENABLE_CPP_EXCEPTIONS": "YES"
      },
      "conditions": [
        [
          "libcma_use_real==1",
          {
            "defines": ["LIBCMA_USE_REAL=1"],
            "sources": ["native/real/ledger_real.cc"],
            "libraries": [
              "-L<(module_root_dir)/<(libcma_lib_dir)",
              "-lcma",
              "-lstdc++"
            ]
          },
          {
            "defines": ["LIBCMA_USE_MOCK=1"],
            "sources": ["native/mock/ledger_mock.cc"]
          }
        ]
      ]
    }
  ]
}
