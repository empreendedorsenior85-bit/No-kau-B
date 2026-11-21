/**
 * Ilustrações do tutorial da impressora (SVG próprio, sem ficheiros externos: funciona também no servidor local sem internet).
 * Desenhos genéricos de uma impressora térmica de talões — cada modelo é um pouco diferente.
 */
const GOLD = "#c9a24a", INK = "#f3ead7", MIST = "#9c9483", BODY = "#2b2620", DARK = "#16130f", OK = "#7fc290", BAD = "#e48a7d";

function Frame({ title, children, caption }: { title: string; children: React.ReactNode; caption?: string }) {
  return (
    <figure className="overflow-hidden rounded-2xl border border-kau-800 bg-kau-950">
      <div role="img" aria-label={title} className="flex justify-center p-4">{children}</div>
      {caption && <figcaption className="border-t border-kau-800 px-4 py-2 text-xs leading-relaxed text-mist">{caption}</figcaption>}
    </figure>
  );
}

/** Impressora vista de frente: botão de ligar, botão FEED, luzes, tampa e saída do papel. */
export function PrinterFront() {
  return (
    <Frame title="Impressora térmica vista de frente" caption="Vista de frente (exemplo). Os botões e as luzes mudam de sítio conforme o modelo — veja o folheto da sua impressora.">
      <svg viewBox="0 0 360 230" className="h-auto w-full max-w-md" aria-hidden>
        <rect x="60" y="60" width="240" height="140" rx="18" fill={BODY} stroke="#4a4237" strokeWidth="2" />
        <rect x="60" y="60" width="240" height="70" rx="18" fill="#353028" />
        <rect x="95" y="52" width="170" height="14" rx="4" fill={DARK} />
        <path d="M110 52 L110 22 Q180 12 250 22 L250 52" fill="#fbf7ee" stroke="#d8cfbd" />
        <line x1="125" y1="30" x2="235" y2="30" stroke="#b9ae99" strokeWidth="2" /><line x1="125" y1="38" x2="210" y2="38" stroke="#b9ae99" strokeWidth="2" />
        <circle cx="105" cy="165" r="13" fill={DARK} stroke={GOLD} strokeWidth="2" /><path d="M105 157 v8 M99 160 a8 8 0 1 0 12 0" stroke={GOLD} strokeWidth="2" fill="none" strokeLinecap="round" />
        <rect x="200" y="155" width="56" height="22" rx="11" fill={DARK} stroke={GOLD} strokeWidth="2" /><text x="228" y="170" textAnchor="middle" fontSize="11" fill={GOLD} fontFamily="sans-serif">FEED</text>
        <circle cx="145" cy="160" r="5" fill={OK} /><circle cx="165" cy="160" r="5" fill={BAD} />
        <text x="105" y="214" textAnchor="middle" fontSize="12" fill={INK} fontFamily="sans-serif">① Ligar</text>
        <text x="228" y="214" textAnchor="middle" fontSize="12" fill={INK} fontFamily="sans-serif">② FEED (avançar papel)</text>
        <text x="155" y="146" textAnchor="middle" fontSize="11" fill={MIST} fontFamily="sans-serif">③ luzes</text>
        <text x="300" y="30" textAnchor="end" fontSize="12" fill={INK} fontFamily="sans-serif">④ saída do talão</text>
        <text x="320" y="98" textAnchor="end" fontSize="11" fill={MIST} fontFamily="sans-serif">tampa</text>
      </svg>
    </Frame>
  );
}

/** Traseira com as entradas: corrente, USB, rede (RJ45). */
export function PrinterBack() {
  const port = (x: number, w: number, label: string, sub: string, el: React.ReactNode) => (
    <g>
      <rect x={x} y="85" width={w} height="46" rx="6" fill={DARK} stroke="#4a4237" />
      {el}
      <text x={x + w / 2} y="172" textAnchor="middle" fontSize="12" fill={INK} fontFamily="sans-serif">{label}</text>
      <text x={x + w / 2} y="188" textAnchor="middle" fontSize="10" fill={MIST} fontFamily="sans-serif">{sub}</text>
    </g>
  );
  return (
    <Frame title="Traseira da impressora com as entradas de corrente, USB e rede" caption="Traseira (exemplo). Muitos modelos têm USB e rede; alguns só têm um deles. A entrada de rede é maior que a de telefone e tem 8 contactos.">
      <svg viewBox="0 0 400 200" className="h-auto w-full max-w-lg" aria-hidden>
        <rect x="20" y="60" width="360" height="90" rx="14" fill={BODY} stroke="#4a4237" strokeWidth="2" />
        {port(45, 70, "Corrente", "transformador", <><circle cx="80" cy="108" r="12" fill="#0b0a08" stroke={MIST} /><circle cx="80" cy="108" r="4" fill={MIST} /></>)}
        {port(150, 70, "USB", "cabo para o computador", <rect x="167" y="98" width="36" height="20" rx="3" fill="#0b0a08" stroke={GOLD} strokeWidth="2" />)}
        {port(255, 90, "Rede (LAN / Ethernet)", "cabo para o router", <><rect x="280" y="94" width="40" height="28" rx="3" fill="#0b0a08" stroke={GOLD} strokeWidth="2" /><rect x="292" y="118" width="16" height="6" fill="#0b0a08" stroke={GOLD} /></>)}
        <text x="200" y="40" textAnchor="middle" fontSize="13" fill={GOLD} fontFamily="sans-serif">Traseira da impressora</text>
      </svg>
    </Frame>
  );
}

/** Como fica tudo ligado: impressora → router ← computador do restaurante → (internet) site Nô Kau. */
export function ConnectionDiagram({ kind }: { kind: "cabo" | "wifi" | "usb" | "bluetooth" }) {
  const box = (x: number, label: string, sub: string, icon: React.ReactNode, hi = false) => (
    <g>
      <rect x={x} y="40" width="110" height="90" rx="14" fill={hi ? "#3a321f" : BODY} stroke={hi ? GOLD : "#4a4237"} strokeWidth="2" />
      {icon}
      <text x={x + 55} y="150" textAnchor="middle" fontSize="12" fill={INK} fontFamily="sans-serif">{label}</text>
      <text x={x + 55} y="166" textAnchor="middle" fontSize="10" fill={MIST} fontFamily="sans-serif">{sub}</text>
    </g>
  );
  const printer = (x: number) => <><rect x={x + 25} y="72" width="60" height="38" rx="6" fill="#4a4237" /><rect x={x + 37} y="58" width="36" height="16" fill="#fbf7ee" /></>;
  const pc = (x: number) => <><rect x={x + 22} y="58" width="66" height="42" rx="4" fill="#0b0a08" stroke={MIST} /><rect x={x + 45} y="100" width="20" height="10" fill={MIST} /></>;
  const router = (x: number) => <><rect x={x + 20} y="80" width="70" height="26" rx="6" fill="#4a4237" /><line x1={x + 35} y1="80" x2={x + 30} y2="58" stroke={MIST} strokeWidth="3" /><line x1={x + 75} y1="80" x2={x + 80} y2="58" stroke={MIST} strokeWidth="3" /></>;
  const wire = (x1: number, x2: number, dashed = false, label?: string) => (
    <g>
      <line x1={x1} y1="85" x2={x2} y2="85" stroke={GOLD} strokeWidth="3" strokeDasharray={dashed ? "6 6" : undefined} />
      {label && <text x={(x1 + x2) / 2} y="76" textAnchor="middle" fontSize="10" fill={GOLD} fontFamily="sans-serif">{label}</text>}
    </g>
  );
  const titles = { cabo: "Rede por cabo (recomendado)", wifi: "Rede Wi-Fi", usb: "USB", bluetooth: "Bluetooth" } as const;
  return (
    <Frame title={`Esquema de ligação: ${titles[kind]}`} caption={kind === "cabo" || kind === "wifi"
      ? "A impressora e o computador do restaurante ficam na MESMA rede (o mesmo router). O site na internet não fala com a impressora: quem envia os talões é o computador do restaurante."
      : kind === "usb" ? "A impressora liga por cabo USB diretamente ao computador do restaurante (no máximo ~3 m de cabo)."
      : "A impressora fica perto do computador do restaurante (até ~10 m, sem paredes grossas pelo meio)."}>
      <svg viewBox="0 0 520 180" className="h-auto w-full max-w-2xl" aria-hidden>
        {kind === "cabo" || kind === "wifi" ? (
          <>
            {box(10, "Impressora", kind === "wifi" ? "ligada ao Wi-Fi" : "cabo de rede", printer(10), true)}
            {wire(120, 205, kind === "wifi", kind === "wifi" ? "Wi-Fi" : "cabo")}
            {box(205, "Router", "a rede do restaurante", router(205))}
            {wire(315, 400, false, "cabo ou Wi-Fi")}
            {box(400, "Computador", "do restaurante (servidor)", pc(400))}
          </>
        ) : (
          <>
            {box(80, "Impressora", kind === "usb" ? "cabo USB" : "Bluetooth", printer(80), true)}
            {wire(190, 330, kind === "bluetooth", kind === "usb" ? "cabo USB" : "sem fios (Bluetooth)")}
            {box(330, "Computador", "do restaurante (servidor)", pc(330))}
          </>
        )}
      </svg>
    </Frame>
  );
}

/** Como colocar o rolo: o lado que imprime (térmico) fica virado para a cabeça de impressão. */
export function PaperRoll() {
  return (
    <Frame title="Como colocar o rolo de papel" caption="O papel térmico só imprime de um lado. Teste: risque-o com a unha — o lado que fica com uma marca escura é o que deve ficar virado para fora/para cima ao sair. Se o talão sair em branco, o rolo está ao contrário.">
      <svg viewBox="0 0 360 180" className="h-auto w-full max-w-md" aria-hidden>
        <rect x="40" y="70" width="200" height="90" rx="14" fill={BODY} stroke="#4a4237" strokeWidth="2" />
        <circle cx="130" cy="115" r="34" fill="#fbf7ee" stroke="#d8cfbd" strokeWidth="2" /><circle cx="130" cy="115" r="10" fill="#c9bfa9" />
        <path d="M130 81 Q200 76 215 58 L250 22" fill="none" stroke="#fbf7ee" strokeWidth="10" strokeLinecap="round" />
        <path d="M222 50 L258 14" fill="none" stroke={GOLD} strokeWidth="2" markerEnd="url(#arrow)" />
        <defs><marker id="arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0 L10 5 L0 10z" fill={GOLD} /></marker></defs>
        <text x="270" y="22" fontSize="12" fill={INK} fontFamily="sans-serif">o papel sai</text>
        <text x="270" y="38" fontSize="12" fill={INK} fontFamily="sans-serif">por cima</text>
        <text x="130" y="175" textAnchor="middle" fontSize="11" fill={MIST} fontFamily="sans-serif">rolo dentro da impressora</text>
        <text x="300" y="120" fontSize="11" fill={MIST} fontFamily="sans-serif" textAnchor="middle">feche bem</text>
        <text x="300" y="136" fontSize="11" fill={MIST} fontFamily="sans-serif" textAnchor="middle">a tampa</text>
      </svg>
    </Frame>
  );
}

/** Medir a largura do rolo: 58 mm ou 80 mm. */
export function PaperWidth() {
  const roll = (x: number, w: number, label: string, sub: string) => (
    <g>
      <rect x={x} y="40" width={w} height="80" rx="6" fill="#fbf7ee" stroke="#d8cfbd" />
      <line x1={x} y1="135" x2={x + w} y2="135" stroke={GOLD} strokeWidth="2" />
      <line x1={x} y1="128" x2={x} y2="142" stroke={GOLD} strokeWidth="2" /><line x1={x + w} y1="128" x2={x + w} y2="142" stroke={GOLD} strokeWidth="2" />
      <text x={x + w / 2} y="158" textAnchor="middle" fontSize="13" fill={INK} fontFamily="sans-serif">{label}</text>
      <text x={x + w / 2} y="174" textAnchor="middle" fontSize="10" fill={MIST} fontFamily="sans-serif">{sub}</text>
    </g>
  );
  return (
    <Frame title="Larguras de papel: 58 mm e 80 mm" caption="Meça a largura do rolo com uma régua: cerca de 5,8 cm → escolha 58 mm; cerca de 8 cm → escolha 80 mm. A largura fica também escrita na caixa dos rolos.">
      <svg viewBox="0 0 360 185" className="h-auto w-full max-w-md" aria-hidden>
        {roll(40, 116, "58 mm", "≈ 5,8 cm · 32 letras por linha")}
        {roll(190, 160, "80 mm", "≈ 8 cm · 48 letras por linha")}
      </svg>
    </Frame>
  );
}

/** Folha de configuração (auto-teste) com o endereço IP em destaque. */
export function SelfTestSheet() {
  const lines = ["*** SELF TEST ***", "Model: POS-80", "Interface: USB + LAN", "IP Address: 192.168.1.50", "Subnet: 255.255.255.0", "Gateway: 192.168.1.1", "DHCP: Off", "Code page: PC860"];
  return (
    <Frame title="Folha de configuração da impressora com o endereço IP" caption="Exemplo de folha de configuração (em inglês na maioria dos modelos). Procure a linha “IP Address” ou “IP”. Os números da sua impressora serão outros.">
      <svg viewBox="0 0 260 250" className="h-auto w-full max-w-xs" aria-hidden>
        <path d="M30 10 H230 V232 l-10 8 -10 -8 -10 8 -10 -8 -10 8 -10 -8 -10 8 -10 -8 -10 8 -10 -8 -10 8 -10 -8 -10 8 -10 -8 -10 8 -10 -8 -10 8 -10 -8 -10 8 -10 -8 Z" fill="#fbf7ee" />
        {lines.map((l, i) => (
          <g key={l}>
            {i === 3 && <rect x="40" y={30 + i * 26 - 15} width="180" height="22" rx="4" fill="none" stroke="#c0392b" strokeWidth="2.5" />}
            <text x={i === 0 ? 130 : 48} y={30 + i * 26} textAnchor={i === 0 ? "middle" : "start"} fontSize="12" fontWeight={i === 0 || i === 3 ? 700 : 400} fill="#222" fontFamily="monospace">{l}</text>
          </g>
        ))}
      </svg>
    </Frame>
  );
}

/** O talão de teste que o sistema imprime (mesmas linhas que o servidor envia). */
export function TestTicket({ paper }: { paper: 58 | 80 }) {
  const cols = paper === 58 ? 32 : 48;
  const w = paper === 58 ? 210 : 300;
  const body = [
    "Impressora: Cozinha", "Ligacao: Rede 192.168.1.50:9100", `Papel: ${paper} mm (${cols} colunas)`, "Tabela: CP860", "Data: 21/11/2026, 18:05",
    "-".repeat(cols), "Acentos: Nô Kau · Camarão · Ação · Pão", "Maiúsculas: ÁÉÍÓÚ ÂÊÔ ÃÕ Ç", "1".repeat(cols),
  ];
  // como o servidor: linhas longas divididas por palavras na largura do papel
  const wrap = (t: string) => {
    if (t.length <= cols) return [t];
    const out: string[] = []; let cur = "";
    for (const w of t.split(" ")) { if ((cur ? cur + " " + w : w).length > cols) { out.push(cur); cur = w; } else cur = cur ? cur + " " + w : w; }
    if (cur) out.push(cur);
    return out;
  };
  const lines = body.flatMap(wrap);
  const tail = [...wrap("Se a linha acima ocupa a largura toda, a largura do papel esta certa."), "-".repeat(cols)];
  const fs = 9.6;
  const H = 80 + (lines.length + tail.length) * 16 + 40;
  return (
    <Frame title={`Talão de teste em papel de ${paper} mm`} caption={`Talão de teste (${paper} mm). A linha de “1” tem de ocupar a largura toda; os acentos têm de aparecer certos; no fim, o papel é cortado (nos modelos com guilhotina).`}>
      <svg viewBox={`0 0 ${w + 20} ${H + 4}`} className="h-auto w-full" style={{ maxWidth: w + 20 }} aria-hidden>
        <rect x="10" y="5" width={w} height={H - 10} fill="#fbf7ee" />
        <text x={10 + w / 2} y="34" textAnchor="middle" fontSize="22" fontWeight="700" fill="#111" fontFamily="monospace">NO KAU</text>
        <text x={10 + w / 2} y="54" textAnchor="middle" fontSize="11" fontWeight="700" fill="#111" fontFamily="monospace">TESTE DE IMPRESSAO</text>
        {[...lines, ...tail].map((l, i) => (
          <text key={i} x="16" y={80 + i * 16} fontSize={fs} fill="#111" fontFamily="monospace" textLength={l.length >= cols ? w - 12 : undefined} lengthAdjust="spacingAndGlyphs">{l}</text>
        ))}
        <text x={10 + w / 2} y={80 + (lines.length + tail.length) * 16 + 14} textAnchor="middle" fontSize="10" fill="#111" fontFamily="monospace">Fim do teste</text>
        <line x1="10" y1={H - 6} x2={10 + w} y2={H - 6} stroke="#999" strokeDasharray="4 3" />
        <text x={14 + w} y={H - 9} fontSize="12" fill={MIST}>✂</text>
      </svg>
    </Frame>
  );
}

/** Sintomas de largura errada. */
export function WrongWidth() {
  return (
    <Frame title="Sintomas de largura de papel errada" caption="Esquerda: escolheu 80 mm num rolo de 58 mm — o texto fica cortado do lado direito. Direita: escolheu 58 mm num rolo de 80 mm — o texto fica estreito, com espaço vazio à direita. Corrija em Editar → Largura do papel.">
      <svg viewBox="0 0 360 150" className="h-auto w-full max-w-md" aria-hidden>
        <rect x="30" y="20" width="120" height="110" fill="#fbf7ee" />
        {[0, 1, 2, 3].map((i) => <text key={i} x="36" y={44 + i * 22} fontSize="11" fill="#111" fontFamily="monospace">111111111111111111111</text>)}
        <rect x="150" y="20" width="10" height="110" fill={DARK} /><text x="90" y="145" textAnchor="middle" fontSize="11" fill={BAD} fontFamily="sans-serif">texto cortado</text>
        <rect x="200" y="20" width="140" height="110" fill="#fbf7ee" />
        {[0, 1, 2, 3].map((i) => <text key={i} x="206" y={44 + i * 22} fontSize="11" fill="#111" fontFamily="monospace">11111111111</text>)}
        <text x="270" y="145" textAnchor="middle" fontSize="11" fill={BAD} fontFamily="sans-serif">texto estreito</text>
      </svg>
    </Frame>
  );
}
