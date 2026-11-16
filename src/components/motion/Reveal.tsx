"use client";
import { useEffect, useRef, type ReactNode } from "react";

/**
 * Scroll reveal discreto (16px + fade), em CSS + IntersectionObserver.
 * Progressive enhancement: o conteúdo só é escondido quando o JS está ativo
 * (classe `js` no <html>), por isso nunca fica invisível em ligações lentas ou se o JS falhar.
 */
export function Reveal({
  children,
  delay = 0,
  className = "",
  as: Tag = "div",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  as?: "div" | "li" | "article";
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          el.classList.add("is-in");
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -10% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <Tag
      ref={ref as React.Ref<never>}
      data-reveal
      className={className}
      style={{ transitionDelay: `${delay}s` }}
    >
      {children}
    </Tag>
  );
}
