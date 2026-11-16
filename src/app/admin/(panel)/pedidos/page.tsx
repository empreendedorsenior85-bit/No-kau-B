import type { Metadata } from "next";
import { OrdersBoard } from "@/components/admin/OrdersBoard";

export const metadata: Metadata = { title: "Pedidos" };

export default function Page() {
  return (
    <>
      <h1 className="mb-5 font-display text-3xl text-white">Pedidos em tempo real</h1>
      <OrdersBoard />
    </>
  );
}
