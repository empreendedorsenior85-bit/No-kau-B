import { DiamondMark } from "@/components/brand/DiamondPattern";
import { ButtonLink } from "@/components/ui/Button";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { MobileActionBar } from "@/components/layout/MobileActionBar";

export default function NotFound() {
  return (
    <>
      <Header />
      <main className="grid min-h-svh place-items-center px-6 pt-20 text-center">
        <div>
          <DiamondMark className="mx-auto text-gold" size={56} />
          <h1 className="mt-6 font-display text-5xl text-white">Página não encontrada</h1>
          <p className="mt-3 text-mist">Esta página não existe — mas a nossa mesa sim.</p>
          <div className="mt-8 flex justify-center gap-3">
            <ButtonLink href="/">Voltar ao início</ButtonLink>
            <ButtonLink href="/menu" variant="outline">Ver o menu</ButtonLink>
          </div>
        </div>
      </main>
      <Footer />
      <MobileActionBar />
    </>
  );
}
