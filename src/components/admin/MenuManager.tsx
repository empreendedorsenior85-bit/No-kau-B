"use client";
import { useActionState, useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { importCatalogAction, removeItemImageAction, saveItemAction, seedDemoAction, setItemFlagsAction, type AdminFormState } from "@/app/admin/actions";
import { CategoriesManager } from "./CategoriesManager";
import { formatXOF } from "@/lib/format";
import { isIllustrative } from "@/lib/illustrative";

export type AdminItem = { id: number; categoryId: string; name: string; description: string; price: number; available: boolean; active: boolean; isDemo: boolean; imageUrl: string | null; reviewNote: string | null };
export type AdminCategory = { id: string; label: string; description: string; active: boolean; items: AdminItem[] };

/** Reduz a foto no telemóvel antes de enviar (máx. 900 px, JPEG): upload rápido e leve na base de dados. */
async function shrink(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 900 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  const blob: Blob | null = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.82));
  return blob ? new File([blob], "foto.jpg", { type: "image/jpeg" }) : file;
}

const field = "mt-1 h-11 w-full rounded-xl border border-kau-800 bg-kau-950 px-3 text-base text-white focus:border-gold-300 focus:outline-none";

function ItemForm({ categories, item, onDone }: { categories: AdminCategory[]; item?: AdminItem; onDone?: () => void }) {
  const router = useRouter();
  const [state, action, pending] = useActionState<AdminFormState, FormData>(saveItemAction, {});
  const fileRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [fileErr, setFileErr] = useState<string | null>(null);

  useEffect(() => {
    if (state.ok) { if (!item) formRef.current?.reset(); router.refresh(); onDone?.(); }
  }, [state, item, router, onDone]);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const small = await shrink(f);
      const dt = new DataTransfer();
      dt.items.add(small);
      e.target.files = dt.files;
      setFileErr(null);
    } catch { setFileErr("Não foi possível preparar a foto."); }
  };

  return (
    <form ref={formRef} action={action} className="grid gap-3 sm:grid-cols-2">
      {item && <input type="hidden" name="id" value={item.id} />}
      <label className="text-sm text-mist sm:col-span-2">Nome<input name="name" required maxLength={120} defaultValue={item?.name} className={field} /></label>
      <label className="text-sm text-mist sm:col-span-2">Descrição<textarea name="description" maxLength={400} rows={2} defaultValue={item?.description} className={`${field} h-auto py-2`} /></label>
      <label className="text-sm text-mist">Preço (FCFA)<input name="price" type="number" inputMode="numeric" min={0} step={1} required defaultValue={item?.price} className={field} /></label>
      <label className="text-sm text-mist">Categoria
        <select name="categoryId" required defaultValue={item?.categoryId ?? ""} className={field}>
          <option value="" disabled>Escolha…</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
      </label>
      <label className="text-sm text-mist sm:col-span-2">Fotografia (opcional)
        <input ref={fileRef} name="image" type="file" accept="image/jpeg,image/png,image/webp" onChange={onFile} className="mt-1 block w-full text-sm text-mist file:mr-3 file:rounded-full file:border-0 file:bg-gold file:px-4 file:py-2 file:text-kau-950" />
      </label>
      {(state.error || fileErr) && <p role="alert" className="text-sm text-[#e48a7d] sm:col-span-2">{state.error ?? fileErr}</p>}
      {state.ok && <p role="status" className="text-sm text-[#7fc290] sm:col-span-2">{state.ok}</p>}
      <div className="sm:col-span-2"><button disabled={pending} className="h-11 rounded-full bg-gold px-6 text-sm font-medium text-kau-950 disabled:opacity-50">{pending ? "A guardar…" : item ? "Guardar alterações" : "Adicionar produto"}</button></div>
    </form>
  );
}

function Row({ item, categories }: { item: AdminItem; categories: AdminCategory[] }) {
  const router = useRouter();
  const [edit, setEdit] = useState(false);
  const [p, start] = useTransition();
  // resposta imediata no ecrã; se o servidor falhar, volta ao valor real
  const [flags, setFlags] = useOptimistic({ available: item.available, active: item.active },
    (s, patch: { available?: boolean; active?: boolean }) => ({ ...s, ...patch }));
  const flag = (f: { available?: boolean; active?: boolean }) => start(async () => { setFlags(f); await setItemFlagsAction(item.id, f); router.refresh(); });
  return (
    <li className={`rounded-2xl border border-kau-800 bg-kau-900 p-4 ${flags.active ? "" : "opacity-60"}`}>
      <div className="flex items-start gap-4">
        {item.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.imageUrl} alt="" className="h-16 w-16 rounded-xl object-cover" />
        )}
        <div className="min-w-0 flex-1">
          <p className="font-display text-lg text-white">{item.name} {item.isDemo && <span className="ml-1 rounded-full border border-dashed border-gold-300/70 px-2 py-0.5 text-[0.6rem] uppercase tracking-wider text-gold-300">Demonstração</span>}</p>
          <p className="text-gold-300">{formatXOF(item.price)}</p>
          {isIllustrative(item.imageUrl) && <p className="mt-1 text-xs text-mist">Foto ilustrativa (IA) — substitua por uma foto real do prato quando possível.</p>}
          {item.reviewNote && <p className="mt-1 text-xs text-[#e0a64a]" data-testid="review-note">⚠ A confirmar: {item.reviewNote}</p>}
        </div>
        <div className="flex flex-col items-end gap-2">
          <button onClick={() => setEdit((v) => !v)} className="rounded-full border border-kau-800 px-3 py-2 text-xs text-mist hover:text-white">{edit ? "Fechar" : "Editar"}</button>
          {item.imageUrl && <button disabled={p} onClick={() => { if (confirm("Remover a fotografia deste produto?")) start(async () => { await removeItemImageAction(item.id); router.refresh(); }); }} className="text-xs text-mist underline underline-offset-4 hover:text-white disabled:opacity-50">Remover foto</button>}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2 text-mist"><input type="checkbox" checked={flags.available} disabled={p} onChange={(e) => flag({ available: e.target.checked })} className="h-4 w-4 accent-[#a9862c]" /> Disponível</label>
        <label className="flex items-center gap-2 text-mist"><input type="checkbox" checked={flags.active} disabled={p} onChange={(e) => flag({ active: e.target.checked })} className="h-4 w-4 accent-[#a9862c]" /> Visível no menu</label>
      </div>
      {edit && <div className="mt-4 border-t border-kau-800 pt-4"><ItemForm categories={categories} item={item} onDone={() => setEdit(false)} /></div>}
    </li>
  );
}

export function MenuManager({ categories, catalog }: { categories: AdminCategory[]; catalog: { total: number; present: number; photos: number; canImport: boolean } }) {
  const router = useRouter();
  const [p, start] = useTransition();
  const [msg, setMsg] = useState<AdminFormState>({});
  const total = categories.reduce((n, c) => n + c.items.length, 0);
  const toReview = categories.flatMap((c) => c.items.filter((i) => i.reviewNote).map((i) => ({ ...i, cat: c.label })));
  return (
    <div className="space-y-10">
      {catalog.canImport && (catalog.present < catalog.total || catalog.photos > 0) && (
        <section className="rounded-2xl border border-gold/50 bg-gold/5 p-5" data-testid="import-panel">
          <h2 className="font-display text-xl text-white">Ementa original do Nô Kau</h2>
          <p className="mt-1 text-sm text-mist">
            {catalog.present} de {catalog.total} produtos da ementa estão no menu. Importa todas as categorias e produtos, com os preços da ementa, sem criar duplicados
            (o que já existe fica como está). Os produtos de demonstração são removidos.
            {catalog.photos > 0 && <> <span data-testid="photos-pending" className="text-gold-300">{catalog.photos} {catalog.photos === 1 ? "produto pode receber uma foto ilustrativa" : "produtos podem receber fotos ilustrativas"}</span> (só onde ainda não há foto).</>}
          </p>
          <button disabled={p} onClick={() => { if (confirm("Importar a ementa original? Os produtos de demonstração serão removidos.")) start(async () => { setMsg(await importCatalogAction()); router.refresh(); }); }}
            className="mt-3 rounded-full bg-gold px-5 py-2.5 text-sm font-medium text-kau-950 disabled:opacity-50">{p ? "A importar…" : "Importar ementa original"}</button>
          {(msg.error || msg.ok) && <p role={msg.error ? "alert" : "status"} className={`mt-2 text-sm ${msg.error ? "text-[#e48a7d]" : "text-[#7fc290]"}`}>{msg.error ?? msg.ok}</p>}
        </section>
      )}
      {catalog.present >= catalog.total && catalog.photos === 0 && msg.ok &&<p role="status" className="text-sm text-[#7fc290]">{msg.ok}</p>}
      {toReview.length > 0 && (
        <details className="rounded-2xl border border-[#e0a64a]/40 bg-[#e0a64a]/5 p-5" data-testid="review-list">
          <summary className="cursor-pointer font-display text-xl text-white">A confirmar ({toReview.length})</summary>
          <p className="mt-2 text-sm text-mist">Pontos da ementa ilegíveis, ambíguos ou corrigidos. Ao editar e guardar um produto, a nota desaparece.</p>
          <ul className="mt-3 space-y-2 text-sm">{toReview.map((i) => <li key={i.id}><strong className="text-white">{i.name}</strong> <span className="text-mist">({i.cat}, {formatXOF(i.price)})</span><br /><span className="text-[#e0a64a]">{i.reviewNote}</span></li>)}</ul>
        </details>
      )}
      <CategoriesManager categories={categories.map((c) => ({ id: c.id, label: c.label, description: c.description, active: c.active, count: c.items.length }))} />
      <section className="rounded-2xl border border-kau-800 bg-kau-900 p-5">
        <h2 className="font-display text-xl text-white">Novo produto</h2>
        <div className="mt-4"><ItemForm categories={categories} /></div>
      </section>

      {total === 0 && (
        <section className="rounded-2xl border border-dashed border-gold/50 p-5">
          <p className="text-white">Ainda não há produtos.</p>
          <p className="mt-1 text-sm text-mist">Adicione os pratos reais acima. Para experimentar o sistema, pode carregar produtos de <strong>demonstração</strong> (preço simbólico, marcados; os pedidos feitos com eles aparecem como “Teste”).</p>
          <button disabled={p} onClick={() => start(async () => { setMsg(await seedDemoAction()); router.refresh(); })} className="mt-3 rounded-full border border-gold/60 px-5 py-2.5 text-sm text-gold-300 hover:bg-gold/10 disabled:opacity-50">Carregar produtos de demonstração</button>
          {(msg.error || msg.ok) && <p className="mt-2 text-sm text-mist">{msg.error ?? msg.ok}</p>}
        </section>
      )}

      {categories.filter((c) => c.items.length).map((c) => (
        <section key={c.id}>
          <h2 className="mb-3 font-display text-2xl text-white">{c.label}</h2>
          <ul className="space-y-3">{c.items.map((i) => <Row key={i.id} item={i} categories={categories} />)}</ul>
        </section>
      ))}
    </div>
  );
}
