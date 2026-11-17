import type { Metadata } from "next";
import { AccountForm } from "@/components/admin/AccountForm";
import { LocalReadOnly } from "@/components/admin/LocalReadOnly";
import { requireManager } from "@/lib/auth";
import { ROLE_LABEL } from "@/lib/auth-types";

export const metadata: Metadata = { title: "A minha conta" };

export default async function Page() {
  const m = await requireManager();
  return (
    <>
      <h1 className="mb-2 font-display text-3xl text-white">A minha conta</h1>
      <p className="mb-8 text-sm text-mist">{m.email} · {ROLE_LABEL[m.role]}</p>
      <LocalReadOnly what="a palavra-passe"><AccountForm /></LocalReadOnly>
    </>
  );
}
