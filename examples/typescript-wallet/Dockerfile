# syntax=docker.io/docker/dockerfile:1
#
# Self-contained Dockerfile when this directory is the Docker / cartesi build context.
# Expects vendor/libcma-binding-node (see scripts/vendor-libcma.sh).
#
# Uses @deroll/cmio for native rollup I/O (no rollup-init HTTP server).

ARG NODE_VERSION=22.14.0
ARG MACHINE_GUEST_TOOLS_VERSION=0.17.2
ARG MACHINE_GUEST_TOOLS_SHA256=c077573dbcf0cdc146adf14b480bfe454ca63aa4d3e8408c5487f550a5b77a41

FROM --platform=linux/riscv64 cartesi/node:${NODE_VERSION}-noble AS build

ARG DEBIAN_FRONTEND=noninteractive
RUN <<EOF
set -eu
apt-get update
apt-get install -y --no-install-recommends \
  build-essential python3 make g++ g++-14 gcc-14 wget ca-certificates git
rm -rf /var/lib/apt/lists/*
EOF

# machine-asset-tools uses -fhardened (GCC ≥ 14); cartesi/node default is g++ 13.
ENV CC=gcc-14 CXX=g++-14

WORKDIR /opt/cartesi
COPY vendor/libcma-binding-node ./libcma
COPY package.json tsconfig.json esbuild.config.mjs ./dapp/
COPY src ./dapp/src

WORKDIR /opt/cartesi/libcma
RUN npm install --ignore-scripts && npm run build:ts
RUN bash scripts/build-libcma-riscv64.sh
ENV LIBCMA_FORCE_REAL=1
RUN npm run build:native

WORKDIR /opt/cartesi/dapp
RUN node -e "const p=require('./package.json'); p.dependencies['@mugen-builders/libcma']='file:/opt/cartesi/libcma'; require('fs').writeFileSync('package.json', JSON.stringify(p,null,2));"
RUN npm install && npm run build

RUN mkdir -p /opt/cartesi/runtime/libcma /opt/cartesi/runtime/app \
  && cp -a /opt/cartesi/dapp/dist/. /opt/cartesi/runtime/app/ \
  && cp -a /opt/cartesi/libcma/lib /opt/cartesi/runtime/libcma/ \
  && cp -a /opt/cartesi/libcma/package.json /opt/cartesi/runtime/libcma/ \
  && cp -a /opt/cartesi/libcma/binding.gyp /opt/cartesi/runtime/libcma/ \
  && mkdir -p /opt/cartesi/runtime/libcma/build/Release \
  && cp -a /opt/cartesi/libcma/build/Release/*.node /opt/cartesi/runtime/libcma/build/Release/ \
  && cp -a /opt/cartesi/libcma/node_modules /opt/cartesi/runtime/libcma/ \
  && mkdir -p /opt/cartesi/runtime/app/node_modules/@mugen-builders \
  && mkdir -p /opt/cartesi/runtime/app/node_modules/@deroll \
  && ln -sfn /opt/cartesi/libcma /opt/cartesi/runtime/app/node_modules/@mugen-builders/libcma \
  && cp -a /opt/cartesi/dapp/node_modules/@deroll/cmio /opt/cartesi/runtime/app/node_modules/@deroll/cmio \
  && cp -a /opt/cartesi/dapp/node_modules/node-gyp-build /opt/cartesi/runtime/app/node_modules/node-gyp-build \
  && cp -a /opt/cartesi/dapp/node_modules/node-addon-api /opt/cartesi/runtime/app/node_modules/node-addon-api

FROM --platform=linux/riscv64 cartesi/node:${NODE_VERSION}-noble-slim

ARG MACHINE_GUEST_TOOLS_VERSION
ARG MACHINE_GUEST_TOOLS_SHA256
ARG DEBIAN_FRONTEND=noninteractive

ADD --checksum=sha256:${MACHINE_GUEST_TOOLS_SHA256} \
  https://github.com/cartesi/machine-guest-tools/releases/download/v${MACHINE_GUEST_TOOLS_VERSION}/machine-guest-tools_riscv64.deb \
  /tmp/machine-guest-tools_riscv64.deb

RUN <<EOF
set -e
apt-get update
apt-get install -y --no-install-recommends libstdc++6 ca-certificates \
  /tmp/machine-guest-tools_riscv64.deb
rm -f /tmp/machine-guest-tools_riscv64.deb
rm -rf /var/lib/apt/lists/* /var/log/* /var/cache/*
EOF

ENV PATH="/opt/cartesi/bin:${PATH}"
WORKDIR /opt/cartesi/dapp
COPY --from=build /opt/cartesi/runtime/app /opt/cartesi/dapp
COPY --from=build /opt/cartesi/runtime/libcma /opt/cartesi/libcma

ENV ETHER_PORTAL_ADDRESS="0x8b53327575ac999bdfa8003f4b5134DFF9027516"
ENV LIBCMA_ACCOUNTS_PATH="/dev/pmem1"
ENV LIBCMA_MAX_ACCOUNTS="4096"
ENV LIBCMA_MEMORY_LENGTH="4194304"
ENV LIBCMA_BACKEND="native"
ENV NODE_PATH="/opt/cartesi/dapp/node_modules"

# CMIO talks to the guest driver directly — no rollup-init HTTP sidecar.
CMD ["node", "index.js"]
