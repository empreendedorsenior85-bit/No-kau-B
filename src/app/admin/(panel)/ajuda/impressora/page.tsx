import type { Metadata } from "next";
import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { requireManager } from "@/lib/auth";
import { isPrintAgent } from "@/lib/print/agent";
import { ConnectionDiagram, PaperRoll, PaperWidth, PrinterBack, PrinterFront, SelfTestSheet, TestTicket, WrongWidth } from "@/components/help/PrinterArt";
import { StepCheck, StepProgress } from "@/components/help/StepCheck";

export const metadata: Metadata = { title: "Tutorial: ligar a impressora" };

const STEPS = [
  { id: "antes", title: "Antes de começar", time: "2 min" },
  { id: "ligar", title: "Ligar a impressora e pôr o papel", time: "3 min" },
  { id: "ligacao", title: "Ligar ao computador: rede, Wi-Fi, USB ou Bluetooth", time: "5–10 min" },
  { id: "painel", title: "Adicionar a impressora no painel", time: "3 min" },
  { id: "papel", title: "Escolher o tamanho do papel", time: "1 min" },
  { id: "teste", title: "Fazer a impressão de teste", time: "2 min" },
  { id: "dia", title: "No dia a dia", time: "2 min" },
];

function Step({ n, id, title, children }: { n: number; id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-t`} className="scroll-mt-24 rounded-3xl border border-kau-800 bg-kau-900/60 p-5 sm:p-7" data-testid={`step-${id}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 id={`${id}-t`} className="flex items-center gap-3 font-display text-2xl text-white sm:text-3xl">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gold font-sans text-lg font-bold text-kau-950">{n}</span>{title}
        </h2>
        <StepCheck id={id} />
      </div>
      <div className="mt-5 space-y-4 text-[0.95rem] leading-relaxed text-mist [&_strong]:text-white">{children}</div>
    </section>
  );
}
const Do = ({ children }: { children: ReactNode }) => <ol className="list-decimal space-y-2 pl-6 marker:font-semibold marker:text-gold-300">{children}</ol>;
const Tip = ({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "warn" | "ok" }) => (
  <p role="note" className={`rounded-2xl border px-4 py-3 text-sm ${tone === "warn" ? "border-[#e0a64a]/50 bg-[#e0a64a]/10 text-[#f3d29b]" : tone === "ok" ? "border-[#7fc290]/50 bg-[#7fc290]/10 text-[#a9dbb4]" : "border-gold/40 bg-gold/5 text-gold-300"}`}>{children}</p>
);
const Shot = ({ src, alt, w, h, caption }: { src: string; alt: string; w: number; h: number; caption: string }) => (
  <figure className="overflow-hidden rounded-2xl border border-kau-800 bg-kau-950">
    <Image src={src} alt={alt} width={w} height={h} className="h-auto w-full" sizes="(max-width: 1024px) 100vw, 760px" unoptimized />
    <figcaption className="border-t border-kau-800 px-4 py-2 text-xs text-mist">{caption}</figcaption>
  </figure>
);
const Btn = ({ children }: { children: ReactNode }) => <span className="whitespace-nowrap rounded-full border border-kau-800 px-2 py-0.5 text-sm text-white">{children}</span>;

const PROBLEMS: { q: string; msg?: string; a: ReactNode }[] = [
  { q: "A página Impressoras só mostra um aviso amarelo e não tem o botão “Adicionar impressora”",
    a: <>Está no <strong>site na internet</strong>. As impressoras só se configuram no <strong>computador do restaurante</strong> (passo 1). Abra o painel nesse computador, ou num telemóvel ligado ao Wi-Fi do restaurante, pelo endereço que o técnico lhe deu (ex.: <code className="break-all">http://192.168.1.10:3000/admin</code>).</> },
  { q: "“A impressora não respondeu a tempo” ou “Impressora inalcançável”",
    msg: "A impressora não respondeu a tempo (desligada, sem rede ou IP errado).",
    a: <><strong>1.</strong> Confirme que a impressora está ligada (luz acesa). <strong>2.</strong> Confirme o cabo de rede (as luzes da entrada de rede devem piscar) ou que está no Wi-Fi do restaurante — não na rede de convidados. <strong>3.</strong> Imprima de novo a folha de configuração e compare o IP com o do painel: se mudou, peça um <strong>IP fixo</strong> ao técnico (passo 3) e corrija em <Btn>Editar</Btn>.</> },
  { q: "“A impressora recusou a ligação”",
    msg: "A impressora recusou a ligação (porta errada ou serviço RAW desligado).",
    a: <>A porta deve ser <strong>9100</strong> (vem assim de fábrica). Confirme em <Btn>Editar</Btn>. Se já está 9100, a função de impressão em rede (“RAW” / “9100”) foi desligada nas definições da impressora — peça ao técnico para a ativar.</> },
  { q: "“Sem papel” ou “Tampa aberta”",
    a: <>Ponha um rolo novo ou feche bem a tampa (deve ouvir um clique). Os talões que estavam à espera <strong>saem sozinhos</strong> quando o problema for resolvido — não é preciso fazer nada no painel.</> },
  { q: "O talão sai em branco",
    a: <>O rolo está ao contrário: o papel térmico só imprime de um lado. Vire o rolo (veja a imagem do passo 2) e faça <Btn>Imprimir teste</Btn> outra vez.</> },
  { q: "Os acentos saem errados (ex.: “Camar?o”, “AÃ§Ã£o”)",
    a: <>Em <Btn>Editar</Btn> mude <strong>Acentos (tabela de caracteres)</strong>: experimente <strong>PC860 — Português</strong>, depois <strong>PC850 — Multilingue</strong>. Se nenhuma ficar certa, escolha <strong>Sem acentos</strong> (sai “Camarao”, sem erros). Faça <Btn>Imprimir teste</Btn> depois de cada mudança.</> },
  { q: "O texto sai cortado à direita, ou muito estreito",
    a: <>A largura do papel está errada. Meça o rolo (passo 5) e corrija em <Btn>Editar</Btn> → <strong>Largura do papel</strong>.</> },
  { q: "O papel não é cortado no fim",
    a: <>Alguns modelos não têm guilhotina: rasgue o talão na serrilha. Se o seu modelo tem guilhotina e não corta, desligue e volte a ligar a impressora; se continuar, contacte o fornecedor.</> },
  { q: "Na Fila aparece “Falhou”",
    a: <>O sistema tentou 6 vezes (durante cerca de 2 minutos) e a impressora não respondeu. Resolva a causa (ver acima) e carregue em <Btn>Tentar de novo</Btn> nessa linha.</> },
  { q: "Na Fila aparece “Incerto”",
    a: <>O computador do restaurante desligou-se a meio do envio, por isso o sistema não sabe se o talão saiu. Para não imprimir em dobro, <strong>não repete sozinho</strong>: veja na impressora se o talão saiu; se não saiu, carregue em <Btn>Imprimir de novo</Btn>.</> },
  { q: "Aceito pedidos mas nenhum talão sai (e não aparece nada na Fila)",
    a: <>Confirme no cartão da impressora: <strong>1.</strong> está <strong>Ativa</strong> (botão <Btn>Ativar</Btn>); <strong>2.</strong> em <Btn>Editar</Btn>, “Imprimir automaticamente quando o pedido é aceite” está marcado; <strong>3.</strong> as <strong>categorias</strong> marcadas incluem os produtos do pedido (nenhuma marcada = imprime tudo). O talão sai quando carrega em <strong>“Iniciar preparação”</strong> — não quando o cliente envia o pedido. Pedidos aceites antes de ativar a impressora não são impressos.</> },
  { q: "USB: “Dispositivo USB não encontrado” ou “Sem permissão”",
    msg: "Dispositivo USB não encontrado (cabo desligado ou caminho errado).",
    a: <>Confirme o cabo USB e que a impressora está ligada. Se continuar, ou se aparecer “Sem permissão…”, é uma configuração do computador do restaurante: peça ao técnico (instruções em <code>docs/impressao.md</code>, secção USB).</> },
  { q: "Bluetooth: “Impressora Bluetooth desligada ou fora de alcance” ou “Porta Bluetooth não existe”",
    a: <>Ligue a impressora e aproxime-a do computador do restaurante (até ~10 m, sem paredes grossas). “Porta Bluetooth não existe” quer dizer que a impressora ainda não foi emparelhada com o computador: peça ao técnico (instruções em <code>docs/impressao.md</code>, secção Bluetooth).</> },
];

/**
 * Tutorial passo a passo para o gerente ligar e configurar a impressora de talões.
 * Descreve o sistema REAL (página Impressoras, botões, mensagens de erro e talão de teste tal como existem).
 */
export default async function Page() {
  await requireManager();
  const local = isPrintAgent();
  return (
    <div className="mx-auto max-w-4xl space-y-8" data-testid="printer-tutorial">
      <header className="space-y-4">
        <p className="text-xs uppercase tracking-[0.2em] text-gold-300">Ajuda · Tutorial</p>
        <h1 className="font-display text-4xl leading-tight text-white sm:text-5xl">Ligar e configurar a impressora de talões</h1>
        <p className="max-w-2xl text-base leading-relaxed text-mist">
          Siga os passos por ordem. Não precisa de conhecimentos técnicos: quando um passo precisar de um técnico, isso está indicado.
          Tempo total: cerca de <strong className="text-white">20 minutos</strong>.
        </p>
        <StepProgress ids={STEPS.map((s) => s.id)} />
      </header>

      <nav aria-label="Passos do tutorial" className="rounded-3xl border border-kau-800 bg-kau-900 p-5" data-testid="tutorial-index">
        <p className="mb-3 font-display text-xl text-white">Passos</p>
        <ol className="grid gap-2 sm:grid-cols-2">
          {STEPS.map((s, i) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className="flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 text-sm text-mist hover:bg-kau-800 hover:text-white">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-gold/60 text-xs text-gold-300">{i + 1}</span>
                <span className="flex-1">{s.title}</span><span className="text-xs">{s.time}</span>
              </a>
            </li>
          ))}
          <li><a href="#problemas" className="flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 text-sm text-[#f3d29b] hover:bg-kau-800"><span className="grid h-7 w-7 place-items-center rounded-full border border-[#e0a64a]/60 text-xs">?</span>Problemas comuns e soluções</a></li>
        </ol>
      </nav>

      <Step n={1} id="antes" title="Antes de começar">
        <p><strong>Precisa de:</strong></p>
        <ul className="list-disc space-y-1 pl-6">
          <li>uma <strong>impressora térmica de talões</strong> (ESC/POS) — por exemplo Epson TM-T20, Xprinter, Rongta, HPRT ou as “POS-80” / “POS-58”;</li>
          <li>um <strong>rolo de papel térmico</strong> (58 mm ou 80 mm de largura);</li>
          <li>o <strong>computador do restaurante</strong> com o servidor do Nô Kau instalado (o técnico instala-o uma vez);</li>
          <li>conforme a ligação: um <strong>cabo de rede</strong> (recomendado), o Wi-Fi do restaurante, um cabo USB ou Bluetooth.</li>
        </ul>
        <Tip tone="warn"><strong>Importante:</strong> os talões são enviados pelo <strong>computador do restaurante</strong>, não pelo site na internet. O site na internet não consegue chegar às impressoras dentro do restaurante. Por isso, a impressora configura-se no painel aberto <strong>a partir do computador do restaurante</strong> (ou de um telemóvel ligado ao Wi-Fi do restaurante).</Tip>
        {local ? (
          <Tip tone="ok" >✓ Está no painel do <strong>computador do restaurante</strong>. Pode seguir todos os passos a partir daqui.</Tip>
        ) : (
          <div className="rounded-2xl border border-[#e48a7d]/50 bg-[#e48a7d]/10 p-4 text-sm text-[#f0b2a8]" data-testid="tutorial-central-warning">
            <p className="font-semibold">Está no site na internet — aqui não é possível ligar impressoras.</p>
            <p className="mt-1">Abra este tutorial no computador do restaurante, ou num telemóvel ligado ao Wi-Fi do restaurante, pelo endereço que o técnico lhe deu — por exemplo <code className="break-all text-white">http://192.168.1.10:3000/admin/ajuda/impressora</code>.</p>
            <p className="mt-1">Ainda não tem o computador do restaurante preparado? Peça ao técnico a instalação do “servidor local” (instruções para ele em <code>docs/servidor-local.md</code>). Pode ler os passos seguintes desde já.</p>
          </div>
        )}
      </Step>

      <Step n={2} id="ligar" title="Ligar a impressora e pôr o papel">
        <div className="grid gap-4 md:grid-cols-2"><PrinterFront /><PaperRoll /></div>
        <Do>
          <li>Ponha a impressora num sítio seco, longe do fogão e da água (na cozinha ou no balcão).</li>
          <li>Ligue o <strong>transformador</strong> à traseira da impressora e à tomada.</li>
          <li>Abra a tampa, coloque o <strong>rolo</strong> com a ponta do papel a sair por cima, puxe um pouco de papel para fora e <strong>feche a tampa</strong> até ouvir um clique.</li>
          <li>Carregue no botão de <strong>ligar</strong>. A luz verde acende. Carregue em <strong>FEED</strong>: o papel deve avançar.</li>
        </Do>
        <Tip>Se acender uma luz vermelha: a tampa está mal fechada ou não há papel.</Tip>
      </Step>

      <Step n={3} id="ligacao" title="Ligar ao computador do restaurante">
        <p>Escolha <strong>uma</strong> forma de ligação. Se a impressora tiver entrada de rede, use o <strong>cabo de rede</strong>: é a mais estável e a única que avisa quando falta papel.</p>
        <PrinterBack />
        <div className="grid gap-3 sm:grid-cols-2" data-testid="connection-options">
          {[
            ["A", "Rede por cabo", "Recomendado", "Cabo da impressora ao router. Avisa sem papel / tampa aberta."],
            ["B", "Wi-Fi", "Bom", "Sem cabo. A impressora tem de ter Wi-Fi e ficar na rede do restaurante."],
            ["C", "USB", "Só com o técnico", "Cabo ao computador do restaurante (Linux). Não avisa quando falta papel."],
            ["D", "Bluetooth", "Só com o técnico", "Impressoras portáteis. Perto do computador (Linux). Não avisa quando falta papel."],
          ].map(([k, t, tag, d]) => (
            <a key={k} href={`#ligacao-${k.toLowerCase()}`} className="rounded-2xl border border-kau-800 bg-kau-950 p-4 hover:border-gold/60">
              <span className="flex items-center justify-between gap-2"><span className="font-display text-xl text-white">{k}. {t}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs ${tag === "Recomendado" ? "bg-[#7fc290]/15 text-[#a9dbb4]" : "bg-white/5 text-mist"}`}>{tag}</span></span>
              <span className="mt-1 block text-sm text-mist">{d}</span>
            </a>
          ))}
        </div>

        <h3 id="ligacao-a" className="scroll-mt-24 pt-2 font-display text-2xl text-white">A. Rede por cabo (recomendado)</h3>
        <ConnectionDiagram kind="cabo" />
        <Do>
          <li>Ligue um <strong>cabo de rede</strong> da entrada “LAN / Ethernet” da impressora a uma entrada livre do <strong>router</strong> (a caixa da internet do restaurante).</li>
          <li><strong>Descubra o endereço IP</strong> da impressora: desligue-a, mantenha o botão <strong>FEED</strong> carregado, ligue-a e solte o FEED passados 2–3 segundos. Sai a <strong>folha de configuração</strong>. (Na maioria dos modelos é assim; se não sair, veja o folheto da impressora.)</li>
          <li>Procure a linha <strong>“IP Address”</strong> e escreva o número num papel (ex.: <code className="text-white">192.168.1.50</code>).</li>
          <li>Peça ao técnico ou ao fornecedor de internet para deixar esse IP <strong>fixo</strong> (“reserva DHCP” no router). Sem isto, o IP pode mudar depois de uma falha de luz e os talões deixam de sair.</li>
        </Do>
        <SelfTestSheet />

        <h3 id="ligacao-b" className="scroll-mt-24 pt-2 font-display text-2xl text-white">B. Wi-Fi</h3>
        <ConnectionDiagram kind="wifi" />
        <Do>
          <li>Ligar a impressora ao Wi-Fi faz-se com a <strong>aplicação ou programa do fabricante</strong> (é diferente em cada marca — veja o folheto, ou peça ao fornecedor/técnico). Escolha a rede Wi-Fi <strong>principal</strong> do restaurante — <strong>não</strong> a rede de convidados.</li>
          <li>Depois de ligada, imprima a <strong>folha de configuração</strong> (como em A) e anote o <strong>IP</strong>.</li>
          <li>Peça para o IP ficar <strong>fixo</strong> (como em A).</li>
        </Do>
        <Tip>No painel, uma impressora Wi-Fi configura-se exatamente como a de cabo: tipo de ligação <strong>Rede (Wi-Fi / Ethernet)</strong>.</Tip>

        <h3 id="ligacao-c" className="scroll-mt-24 pt-2 font-display text-2xl text-white">C. USB</h3>
        <ConnectionDiagram kind="usb" />
        <Do>
          <li>Ligue o cabo USB da impressora ao <strong>computador do restaurante</strong> (não a um telemóvel nem a outro computador).</li>
          <li>Na primeira vez, o <strong>técnico</strong> tem de dar autorização ao servidor para usar a impressora (instruções para ele em <code>docs/impressao.md</code>, secção USB). Só funciona se o computador do restaurante usar Linux.</li>
          <li>No painel, a porta é normalmente <code className="text-white">/dev/usb/lp0</code> (já vem preenchida).</li>
        </Do>

        <h3 id="ligacao-d" className="scroll-mt-24 pt-2 font-display text-2xl text-white">D. Bluetooth</h3>
        <ConnectionDiagram kind="bluetooth" />
        <Do>
          <li>A impressora tem de ser <strong>emparelhada uma vez</strong> com o computador do restaurante pelo <strong>técnico</strong> (o código costuma ser <code className="text-white">0000</code> ou <code className="text-white">1234</code>; instruções em <code>docs/impressao.md</code>, secção Bluetooth). Só funciona se o computador do restaurante usar Linux.</li>
          <li>No painel, a porta é normalmente <code className="text-white">/dev/rfcomm0</code> (já vem preenchida).</li>
          <li>Mantenha a impressora a menos de ~10 m do computador.</li>
        </Do>
      </Step>

      <Step n={4} id="painel" title="Adicionar a impressora no painel">
        <Do>
          <li>No menu lateral, abra <Link href="/admin/impressoras" className="text-gold-300 underline underline-offset-4">Impressoras</Link> (no telemóvel: botão ☰ → Impressoras).</li>
          <li>Desça até <strong>“Adicionar impressora”</strong> e preencha:</li>
        </Do>
        <Shot src="/ajuda/impressora-formulario.png" w={880} h={684} alt="Formulário Adicionar impressora preenchido com o exemplo Cozinha, rede, IP 192.168.1.50, porta 9100, 80 mm, PC860"
          caption="O ecrã real “Adicionar impressora”, preenchido com um exemplo. Use os dados da SUA impressora." />
        <dl className="divide-y divide-kau-800 overflow-hidden rounded-2xl border border-kau-800" data-testid="fields-table">
          {[
            ["Nome", "Um nome fácil: “Cozinha”, “Bar”…"],
            ["Onde imprime", "Cozinha ou Balcão / bar."],
            ["Tipo de ligação", "Rede (Wi-Fi / Ethernet) para A e B; USB para C; Bluetooth para D."],
            ["Endereço IP", "(rede) O número da folha de configuração, ex.: 192.168.1.50."],
            ["Porta", "(rede) Deixe 9100."],
            ["Dispositivo USB / Porta Bluetooth", "Deixe o que vem preenchido, salvo indicação do técnico."],
            ["Largura do papel", "58 mm ou 80 mm — ver passo 5."],
            ["Acentos (tabela de caracteres)", "PC860 — Português (recomendado). Se os acentos saírem mal, ver Problemas."],
            ["Cópias por pedido", "Normalmente 1."],
            ["Imprimir automaticamente…", "Deixe marcado: o talão sai sozinho quando aceita o pedido."],
            ["Categorias", "O que esta impressora recebe. Ex.: cozinha = pratos; bar = bebidas. Nenhuma marcada = tudo."],
          ].map(([f, d]) => (
            <div key={f} className="grid gap-1 p-3 text-sm sm:grid-cols-[14rem_1fr] sm:gap-4">
              <dt className="font-medium text-white">{f}</dt><dd className="text-mist">{d}</dd>
            </div>
          ))}
        </dl>
        <Do><li value={3}>Carregue em <Btn>Adicionar impressora</Btn>. Ela aparece na lista <strong>“Impressoras”</strong>, no topo da página.</li></Do>
        <Tip>Tem uma impressora na cozinha e outra no bar? Adicione as duas, cada uma com as suas categorias: cada pedido é dividido automaticamente.</Tip>
      </Step>

      <Step n={5} id="papel" title="Escolher o tamanho do papel">
        <PaperWidth />
        <p>Escolha em <strong>Largura do papel</strong> o valor do seu rolo. Para mudar depois: no cartão da impressora, <Btn>Editar</Btn> → Largura do papel → <Btn>Guardar</Btn>.</p>
        <WrongWidth />
      </Step>

      <Step n={6} id="teste" title="Fazer a impressão de teste">
        <Shot src="/ajuda/impressora-cartao.png" w={434} h={200} alt="Cartão da impressora com o estado Ligada, os botões Testar ligação, Imprimir teste, Editar e Desativar e a mensagem Ligação OK. Papel OK."
          caption="O cartão da impressora depois de “Testar ligação” (ecrã real, exemplo)." />
        <Do>
          <li>No cartão da impressora, carregue em <Btn>Testar ligação</Btn>. <strong>Não imprime nada</strong>: só confirma que o computador chega à impressora. Deve aparecer <strong className="text-[#a9dbb4]">“Ligação OK. Papel OK.”</strong> e o estado <strong>Ligada</strong> (ponto verde). Aparece uma mensagem a vermelho? Veja <a href="#problemas" className="text-gold-300 underline underline-offset-4">Problemas comuns</a>.</li>
          <li>Carregue em <Btn>Imprimir teste</Btn>. Aparece “Teste enviado para a fila — deve sair dentro de segundos.” e, na impressora, sai um talão assim:</li>
        </Do>
        <div className="grid items-start gap-4 sm:grid-cols-2"><TestTicket paper={80} /><TestTicket paper={58} /></div>
        <p><strong>Confirme no talão:</strong></p>
        <ul className="space-y-1 pl-1">
          <li>✓ A linha de <strong>“1111…”</strong> ocupa a largura toda do papel → a largura está certa.</li>
          <li>✓ <strong>“Nô Kau · Camarão · Ação · Pão”</strong> sai com os acentos certos → a tabela de caracteres está certa.</li>
          <li>✓ O papel é <strong>cortado</strong> no fim (nos modelos com guilhotina).</li>
        </ul>
        <Shot src="/ajuda/impressora-fila.png" w={880} h={147} alt="Tabela Fila e histórico com o teste no estado Impresso"
          caption="Em “Fila e histórico”, o teste aparece como “Impresso” (ecrã real)." />
        <Tip tone="ok">Tudo certo? A impressora está pronta. 🎉</Tip>
      </Step>

      <Step n={7} id="dia" title="No dia a dia">
        <ul className="list-disc space-y-2 pl-6">
          <li>O talão sai <strong>sozinho</strong> quando carrega em <strong>“Iniciar preparação”</strong> num pedido (em Pedidos ou em Mesas). Não sai quando o cliente envia o pedido — só quando a equipa o aceita.</li>
          <li>Se a impressora estiver desligada ou sem papel, o talão <strong>fica à espera</strong> e sai quando o problema for resolvido. Nunca sai em dobro.</li>
          <li>Precisa de outra via? Em <Link href="/admin/impressoras" className="text-gold-300 underline underline-offset-4">Impressoras</Link> → Fila e histórico → <Btn>Reimprimir</Btn> (sai com a marca “REIMPRESSÃO”).</li>
          <li>Recibo do pagamento para o cliente: em Pagamentos, abra o recibo e use <Btn>Imprimir no talão</Btn> (no computador do restaurante).</li>
          <li>Ao trocar o rolo, use sempre papel <strong>térmico</strong> da mesma largura.</li>
        </ul>
      </Step>

      <section id="problemas" aria-labelledby="problemas-t" className="scroll-mt-24 space-y-3" data-testid="tutorial-problems">
        <h2 id="problemas-t" className="font-display text-3xl text-white">Problemas comuns e soluções</h2>
        <p className="text-sm text-mist">Toque no problema para ver a solução. As frases entre aspas são as mensagens exatas que aparecem no painel.</p>
        {PROBLEMS.map((p) => (
          <details key={p.q} className="group rounded-2xl border border-kau-800 bg-kau-900 open:border-gold/50" data-testid="problem">
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-white">
              <span>{p.q}</span><span aria-hidden className="text-gold-300 transition-transform group-open:rotate-45">＋</span>
            </summary>
            <div className="space-y-2 border-t border-kau-800 px-4 py-3 text-sm leading-relaxed text-mist [&_strong]:text-white">
              {p.msg && <p className="rounded-lg bg-kau-950 px-3 py-2 font-mono text-xs text-[#f0b2a8]">{p.msg}</p>}
              <p>{p.a}</p>
            </div>
          </details>
        ))}
        <Tip>Ainda não funciona? Envie ao técnico: a <strong>marca e o modelo</strong> da impressora, uma <strong>foto da folha de configuração</strong> e a <strong>mensagem exata</strong> que aparece no cartão da impressora.</Tip>
      </section>
    </div>
  );
}
