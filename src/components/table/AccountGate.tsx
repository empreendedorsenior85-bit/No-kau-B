"use client";
import { useState } from "react";
import { ClientLoginForm, RegisterForm } from "@/components/client/ClientForms";

/**
 * Conta obrigatória para enviar o pedido — sem sair do carrinho. Depois de entrar ou criar conta, a página volta
 * ao menu da mesa com o carrinho aberto (o carrinho fica guardado no telemóvel e não se perde).
 */
export function AccountGate({ token, online }: { token: string; online: boolean }) {
  const [tab, setTab] = useState<"registo" | "entrar">("registo");
  const volta = `/m/${token}?carrinho=1`;
  return (
    <section data-testid="account-gate" aria-labelledby="gate-title" className="space-y-4">
      <div>
        <h3 id="gate-title" className="font-display text-2xl text-white">Falta só a sua conta</h3>
        <p className="mt-1 text-sm text-mist">
          Para enviar o pedido precisa de uma conta Nô Kau — fica com o histórico dos pedidos, pagamentos e recibos.
          O carrinho está guardado.
        </p>
      </div>
      {!online && (
        <p role="alert" className="rounded-xl border border-[#e0a64a]/50 bg-[#e0a64a]/10 px-4 py-3 text-sm text-[#f3d29b]">
          Sem ligação: para entrar ou criar conta é preciso internet ou o Wi-Fi do restaurante. Pode também chamar um empregado.
        </p>
      )}
      <div role="tablist" aria-label="Conta" className="grid grid-cols-2 gap-1 rounded-full border border-kau-800 p-1 text-sm">
        {(["registo", "entrar"] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} data-testid={`gate-tab-${t}`}
            className={`rounded-full px-4 py-2 ${tab === t ? "bg-gold text-kau-950" : "text-mist hover:text-white"}`}>
            {t === "registo" ? "Criar conta" : "Já tenho conta"}
          </button>
        ))}
      </div>
      {tab === "registo" ? <RegisterForm volta={volta} /> : <ClientLoginForm volta={volta} />}
    </section>
  );
}
