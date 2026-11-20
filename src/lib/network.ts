// Which Bitcoin Cash network the app runs on. Set NEXT_PUBLIC_BCH_NETWORK=chipnet
// to run against the free test network (see `npm run dev:chipnet`).
export type Network = "mainnet" | "chipnet";

export const NETWORK: Network = process.env.NEXT_PUBLIC_BCH_NETWORK === "chipnet" ? "chipnet" : "mainnet";
export const IS_CHIPNET = NETWORK === "chipnet";

/** CashAddress prefix. */
export const PREFIX = (IS_CHIPNET ? "bchtest" : "bitcoincash") as "bitcoincash";

export const ELECTRUM_SERVERS = IS_CHIPNET
  ? ["chipnet.imaginary.cash", "chipnet.bch.ninja"]
  : ["bch.imaginary.cash", "fulcrum.greyh.at", "bch.loping.net", "electrum.imaginary.cash"];

export const EXPLORER = IS_CHIPNET ? "https://cbch.loping.net" : "https://explorer.salemkode.com";
