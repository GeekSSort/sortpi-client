import { redirect } from "next/navigation";

/**
 * /sales-pos was the till, before it moved into its own environment. The
 * section is Sales & Return now, so the bare path lands on Sales; the till
 * itself is at /pos.
 */
export default function SalesPosRedirect() {
  redirect("/sales-pos/sales");
}
