"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useWizardConnect, WizardConnectQRDialog } from "@wizardconnect/react";
import type { DappConnectionManager } from "@wizardconnect/dapp";
import { primaryAddress, walletBalance } from "@/lib/wallet";

interface WalletCtx {
  ready: boolean;
  connecting: boolean;
  manager: DappConnectionManager | null;
  address: string | null;
  walletName: string | null;
  balance: number | null;
  refreshBalance: () => Promise<void>;
  /** Opens the WizardConnect QR; resolves with the wallet manager once connected (null if cancelled). */
  connect: () => Promise<DappConnectionManager | null>;
  disconnect: () => Promise<void>;
}

const Ctx = createContext<WalletCtx | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const wc = useWizardConnect({
    dappName: "Unlock — sell anything for BCH",
    dappIcon: typeof window !== "undefined" ? new URL("/icon.png", window.location.href).href : undefined,
  });
  const [showQr, setShowQr] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const waiters = useRef<((m: DappConnectionManager | null) => void)[]>([]);
  const ready = wc.state === "connected" && wc.manager != null && primaryAddress(wc.manager) != null;

  const refreshBalance = useCallback(async () => {
    if (!wc.manager || !ready) return;
    try {
      setBalance(await walletBalance(wc.manager));
    } catch {
      setBalance(null);
    }
  }, [wc.manager, ready]);

  useEffect(() => {
    if (!ready) {
      setBalance(null);
      return;
    }
    setShowQr(false);
    refreshBalance();
    waiters.current.splice(0).forEach((resolve) => resolve(wc.manager));
  }, [ready, refreshBalance, wc.manager]);

  const connect = useCallback(() => {
    if (ready) return Promise.resolve(wc.manager);
    if (wc.state !== "connecting") wc.connect();
    setShowQr(true);
    return new Promise<DappConnectionManager | null>((resolve) => waiters.current.push(resolve));
  }, [ready, wc]);

  const closeQr = useCallback(() => {
    setShowQr(false);
    waiters.current.splice(0).forEach((resolve) => resolve(null));
    if (!ready) wc.disconnect();
  }, [ready, wc]);

  const value = useMemo<WalletCtx>(
    () => ({
      ready,
      connecting: wc.state === "connecting" || wc.state === "reconnecting",
      manager: ready ? wc.manager : null,
      address: ready && wc.manager ? primaryAddress(wc.manager) : null,
      walletName: wc.walletName,
      balance,
      refreshBalance,
      connect,
      disconnect: wc.disconnect,
    }),
    [ready, wc.state, wc.manager, wc.walletName, wc.disconnect, balance, refreshBalance, connect],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      {wc.uri && wc.qrUri && (
        <WizardConnectQRDialog
          show={showQr && !ready}
          onClose={closeQr}
          uri={wc.uri}
          qrUri={wc.qrUri}
          title="Connect your BCH wallet"
          subtitle="Scan with Paytaca, Cashonize or any WizardConnect wallet"
          theme={{
            dialogBackground: "#17120f",
            headerBackground: "#17120f",
            borderColor: "#3a2a20",
            uriRowBackground: "rgba(255,255,255,0.04)",
          }}
        />
      )}
      {wc.uri && showQr && !ready && (
        <div className="mobile-connect">
          <span className="grow">On your phone?</span>
          <a className="btn btn-primary btn-sm" href={wc.uri}>Open wallet</a>
          <button className="btn btn-ghost btn-sm" onClick={() => navigator.clipboard?.writeText(wc.uri!)}>Copy</button>
        </div>
      )}
    </Ctx.Provider>
  );
}

export function useWallet() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useWallet must be used inside WalletProvider");
  return ctx;
}
