"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";

type Face = ReactNode | ((toggle: ReactNode) => ReactNode);
const place = (face: Face, toggle: ReactNode) =>
  typeof face === "function" ? face(toggle) : <>{face}<div className="absolute right-3 top-3 z-10">{toggle}</div></>;

/**
 * Cartão de prato com frente e verso (rotação 3D em CSS — ver `.flip-*` em globals.css).
 *
 * - Com rato (`hover`): vira ao passar por cima e volta ao sair.
 * - Toque / clique na superfície do cartão: vira e volta (os botões e links do cartão não viram o cartão).
 * - Teclado: o botão "Detalhes" / "Voltar" vira o cartão e leva o foco para o outro lado.
 * - Só o lado visível é clicável e lido por leitores de ecrã (o outro fica `visibility: hidden`).
 * - Com "reduzir movimento" no sistema, troca de lado sem animação.
 *
 * A altura do cartão é a do lado mais alto (os dois lados ocupam a mesma célula de grelha): não há saltos.
 */
export function FlipCard({
  as: Tag = "li",
  label,
  front,
  back,
  hover = false,
  className = "",
  faceClassName = "",
  testId,
}: {
  as?: "li" | "div";
  /** nome do prato — para os botões "Ver detalhes de …" / "Voltar à frente de …" */
  label: string;
  /** conteúdo de cada lado; como função, recebe o botão de virar para o colocar onde fizer sentido
   *  (sem função, o botão fica no canto superior direito) */
  front: Face;
  back: Face;
  /** vira ao passar o rato (só em aparelhos com rato) */
  hover?: boolean;
  className?: string;
  /** classes de cada lado (fundo, borda, cantos) */
  faceClassName?: string;
  testId?: string;
}) {
  const [flipped, setFlipped] = useState(false);
  const pointer = useRef<string>("");
  const moveFocus = useRef(false);
  const frontBtn = useRef<HTMLButtonElement>(null);
  const backBtn = useRef<HTMLButtonElement>(null);

  // depois de virar pelo botão, o foco passa para o botão do lado que ficou visível
  useEffect(() => {
    if (!moveFocus.current) return;
    moveFocus.current = false;
    (flipped ? backBtn : frontBtn).current?.focus({ preventScroll: true });
  }, [flipped]);

  const toggleFromButton = () => {
    moveFocus.current = true;
    setFlipped((f) => !f);
  };

  return (
    <Tag
      className={`flip-card ${className}`}
      data-flipped={flipped ? "true" : "false"}
      data-hover={hover ? "true" : undefined}
      data-testid={testId}
      onPointerDown={(e) => { pointer.current = e.pointerType; }}
      onPointerLeave={(e) => { if (hover && e.pointerType === "mouse") setFlipped(false); }}
      onClick={(e) => {
        // botões, links e campos do cartão fazem o que já faziam — não viram o cartão
        if ((e.target as HTMLElement).closest("button, a, input, select, textarea, label")) return;
        // com rato, quem vira é o "passar por cima"
        if (hover && pointer.current === "mouse") return;
        setFlipped((f) => !f);
      }}
    >
      <div className="flip-inner">
        <div className={`flip-face flip-front ${faceClassName}`} data-testid={testId ? `${testId}-front` : undefined}>
          {place(front, <FlipButton ref={frontBtn} onClick={toggleFromButton} label={`Ver detalhes de ${label}`} text="Detalhes" />)}
        </div>
        <div className={`flip-face flip-back ${faceClassName}`} data-testid={testId ? `${testId}-back` : undefined}>
          {place(back, <FlipButton ref={backBtn} onClick={toggleFromButton} label={`Voltar à frente de ${label}`} text="Voltar" back />)}
        </div>
      </div>
    </Tag>
  );
}

function FlipButton({ ref, onClick, label, text, back = false }: { ref: React.Ref<HTMLButtonElement>; onClick: () => void; label: string; text: string; back?: boolean }) {
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      aria-label={label}
      className="relative inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-kau-950/75 px-3 text-[0.7rem] uppercase tracking-[0.12em] text-white/90 backdrop-blur-sm transition-colors hover:bg-kau-950/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-300"
    >
      <svg aria-hidden width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={back ? "-scale-x-100" : ""}>
        <path d="M21 12a9 9 0 1 1-3-6.7" />
        <path d="M21 4v5h-5" />
      </svg>
      {text}
    </button>
  );
}
