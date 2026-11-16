import { DiamondMark } from "@/components/brand/DiamondPattern";

export default function NotFound() {
  return (
    <main className="grid min-h-svh place-items-center bg-kau-950 px-6 text-center">
      <div>
        <DiamondMark className="mx-auto text-gold" size={56} />
        <h1 className="mt-6 font-display text-3xl text-white">QR Code inválido</h1>
        <p className="mt-3 max-w-sm text-mist">Este QR Code não está ativo. Peça ajuda a um empregado do Nô Kau.</p>
      </div>
    </main>
  );
}
