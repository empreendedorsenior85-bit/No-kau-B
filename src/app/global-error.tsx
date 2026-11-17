"use client";

/** Último recurso (falha no próprio layout): página mínima, sem depender de mais nada do site. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="pt-PT">
      <body style={{ margin: 0, minHeight: "100svh", display: "grid", placeItems: "center", background: "#151109", color: "#fff", fontFamily: "system-ui, sans-serif", textAlign: "center", padding: 24 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 400 }}>Nô Kau — algo correu mal</h1>
          <p style={{ color: "#b9ad97" }}>Tente novamente dentro de instantes.</p>
          <button onClick={reset} style={{ marginTop: 16, padding: "12px 24px", borderRadius: 999, border: 0, background: "#a9862c", color: "#151109", fontSize: 16 }}>
            Tentar novamente
          </button>
          {error.digest && <p style={{ marginTop: 24, fontSize: 12, color: "#8a806e" }}>Código: {error.digest}</p>}
        </div>
      </body>
    </html>
  );
}
