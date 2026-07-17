/**
 * Portal address book — same responsibility split as the Rust CMA wallet:
 * libcma does not hardcode portal addresses (they differ per network), so the
 * application loads them from env with `@cartesi/viem` book defaults.
 */
import {
  erc1155BatchPortalAddress,
  erc1155SinglePortalAddress,
  erc20PortalAddress,
  erc721PortalAddress,
  etherPortalAddress,
} from "@cartesi/viem/abi";
import { getAddress, type Address } from "viem";

export type PortalKind =
  | "ether"
  | "erc20"
  | "erc721"
  | "erc1155-single"
  | "erc1155-batch";

export type PortalAddresses = {
  ether: Address;
  erc20: Address;
  erc721: Address;
  erc1155Single: Address;
  erc1155Batch: Address;
};

function portalFromEnv(varName: string, fallback: string): Address {
  return getAddress(process.env[varName] ?? fallback);
}

export function loadPortalAddresses(): PortalAddresses {
  return {
    ether: portalFromEnv("ETHER_PORTAL_ADDRESS", etherPortalAddress),
    erc20: portalFromEnv("ERC20_PORTAL_ADDRESS", erc20PortalAddress),
    erc721: portalFromEnv("ERC721_PORTAL_ADDRESS", erc721PortalAddress),
    erc1155Single: portalFromEnv(
      "ERC1155_SINGLE_PORTAL_ADDRESS",
      erc1155SinglePortalAddress,
    ),
    erc1155Batch: portalFromEnv(
      "ERC1155_BATCH_PORTAL_ADDRESS",
      erc1155BatchPortalAddress,
    ),
  };
}

/** Resolve an advance `msgSender` to a known portal, if any. */
export function matchPortal(
  portals: PortalAddresses,
  sender: Address,
): PortalKind | undefined {
  if (sender === portals.ether) return "ether";
  if (sender === portals.erc20) return "erc20";
  if (sender === portals.erc721) return "erc721";
  if (sender === portals.erc1155Single) return "erc1155-single";
  if (sender === portals.erc1155Batch) return "erc1155-batch";
  return undefined;
}
