"use client";

import React, { useEffect, useRef } from "react";
import ProductGrid from "@/components/modules/pos/ProductGrid";
import CartPanel from "@/components/modules/pos/CartPanel";
import SelectedItems from "@/components/modules/pos/SelectedItems";
import { ProductItem, CartItem } from "@/types/pos";
import { usePosView } from "@/components/modules/pos/posView";
import { PosService } from "@/services";
import { usePosDraft, setDraftItems } from "@/components/modules/pos/posCart";

export default function PosPage() {
  // The cart outlives this page on purpose: a cashier who steps over to
  // Products or Customers mid-sale comes back to the same invoice. See
  // posCart.ts.
  const cart = usePosDraft().items;
  const setCart = setDraftItems;

  const view = usePosView();

  /**
   * A restored cart is re-priced once, on the way in.
   *
   * The cart survives a reload and a walk to another screen, which is the point
   * of it — but every line carries the price it was added at, and a cart
   * restored hours later can carry a price the shop has since changed. The
   * server prices the sale itself at checkout, so the till would have shown one
   * figure and charged another, with the customer standing there for both.
   *
   * Once, guarded by a ref rather than a dependency list: this must not re-run
   * every time the cart changes, or adding an item would fire a lookup per line
   * on every keystroke of the quantity stepper.
   */
  const repriced = useRef(false);
  useEffect(() => {
    if (repriced.current || cart.length === 0) return;
    repriced.current = true;
    void PosService.repriceCart(cart).then((fresh) => {
      const changed = fresh.some(
        (line, i) => line.product.price !== cart[i]?.product.price
      );
      if (changed) setCart(() => fresh);
    });
  }, [cart, setCart]);

  /**
   * What the shelf can cover.
   *
   * The stepper used to count past it, and every screen agreed with the
   * cashier: the line said six, the total said six, the customer was told the
   * price of six — and the SALE was refused at the payment screen, because the
   * server will not sell stock it does not have. Unpicking a basket in front of
   * a queue is the worst possible moment to discover a shelf holds four.
   *
   * Zero or less is not a ceiling of zero. A line already in the cart when its
   * stock ran out — a restored cart, another till selling the last one — must
   * not be silently emptied under the cashier; it stays as it is and the sale
   * is refused with a reason if they try to take it through.
   */
  const capFor = (product: ProductItem, wanted: number) =>
    product.stock > 0 ? Math.min(wanted, product.stock) : wanted;

  const handleSelectProduct = (product: ProductItem) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: capFor(item.product, item.quantity + 1) }
            : item
        );
      }
      return [...prev, { product, quantity: capFor(product, 1) }];
    });
  };

  /**
   * Set a quantity outright, from the box the cashier typed in.
   *
   * Separate from the stepper because it is a different operation: the stepper
   * moves BY an amount and can never overshoot the shelf by more than one, and
   * this one lands ON an amount and has to be capped against it. Sharing the
   * handler meant the typed figure was read as a delta and a cashier typing 3
   * added three to what was already there.
   */
  const handleSetQuantity = (productId: string, next: number) => {
    setCart((prev) => {
      return prev
        .map((item) => {
          if (item.product.id !== productId) return item;
          // A whole-number unit refuses fractions at the server, so the till
          // rounds rather than sending one it knows will be refused.
          const wanted = item.product.allowDecimal ? next : Math.round(next);
          const capped = capFor(item.product, wanted);
          return capped > 0 ? { ...item, quantity: capped } : item;
        })
        .filter(Boolean) as CartItem[];
    });
  };

  const handleUpdateQuantity = (productId: string, delta: number) => {
    setCart((prev) => {
      return prev
        .map((item) => {
          if (item.product.id === productId) {
            // Down is never capped: a cashier taking something OFF the sale is
            // always allowed, whatever the shelf says.
            const newQty =
              delta > 0 ? capFor(item.product, item.quantity + delta) : item.quantity + delta;
            return newQty > 0 ? { ...item, quantity: newQty } : null;
          }
          return item;
        })
        .filter(Boolean) as CartItem[];
    });
  };

  const handleRemoveItem = (productId: string) => {
    setCart((prev) => prev.filter((item) => item.product.id !== productId));
  };

  const handleClearCart = () => {
    // The lines only. Whom the invoice is for and the rate it is taxed at
    // survive an emptied cart exactly as they did when this was `useState`;
    // Reset and a completed sale are what clear those, and they say so.
    setCart(() => []);
  };

  const handleRestoreCart = (items: CartItem[]) => {
    setCart(() => items);
  };

  if (view === "columns") {
    return (
      <div className="flex min-h-0 w-full flex-1 flex-col">
        {/* Products, what has been rung up, and the money — one job each. All
            three are as tall as the window and scroll inside themselves, so
            the page never scrolls as a whole. */}
        {/* Selected items and the invoice are the SAME width — they are the two
            halves of one sale, and a cashier reads across them.

            They were 0.95fr and 1.2fr. Equalising them at the NARROWER figure
            would have been the obvious way and is the wrong one: the invoice
            column carries the discount box, the coupon field and the totals,
            and narrowing it clips their labels. So both sit at the WIDER of the
            two and the difference comes off the product wall, which gives up
            2.1fr for 1.85fr — tiles have a 150px minimum, and 1.85fr still
            fits the same number per row at every width the till is used at.
            The three tracks still sum to 4.25, so nothing else on the page
            moves. */}
        <div className="grid h-full w-full min-h-0 grid-cols-1 gap-[16px] xl:grid-cols-[1.85fr_1.2fr_1.2fr]">
          <div className="flex min-h-0 min-w-0 flex-col overflow-y-auto rounded-[12px] bg-white p-[16px] shadow-[inset_0_0_0_1px_#eaeaea]">
            <ProductGrid onSelectProduct={handleSelectProduct} />
          </div>

          <div className="flex h-full min-h-0 min-w-0 flex-col">
            <SelectedItems
              cart={cart}
              onUpdateQuantity={handleUpdateQuantity}
            onSetQuantity={handleSetQuantity}
              onRemoveItem={handleRemoveItem}
              onClearCart={handleClearCart}
            />
          </div>

          <div className="flex min-h-0 min-w-0 flex-col overflow-y-auto rounded-[12px] bg-white p-[16px] shadow-[inset_0_0_0_1px_#eaeaea]">
            <CartPanel
              cart={cart}
              showItems={false}
              onUpdateQuantity={handleUpdateQuantity}
            onSetQuantity={handleSetQuantity}
              onRemoveItem={handleRemoveItem}
              onClearCart={handleClearCart}
              onRestoreCart={handleRestoreCart}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col">
      {/* pos-split (globals.css) keeps the designed 50/50 up to the design
          width, then pins the invoice column at its natural 565 so a wide
          monitor gives the extra pixels to the product grid instead. Both
          columns are as tall as the window and scroll inside themselves. */}
      <div className="pos-split grid h-full w-full min-h-0 grid-cols-1 gap-[16px]">
        {/* Product list (left) — 45:2171.
            The SAME card as the three-column view: white, 12px radius, 16px
            padding, a hairline inset border. The two views used to look like
            two products — bare columns on a grey page here, bordered cards
            there — and a cashier switching between them had to re-find every
            control. The gap matches too (16 rather than 31), so the two
            layouts sit on the same grid. */}
        <div className="flex min-h-0 min-w-0 flex-col overflow-y-auto rounded-[12px] bg-white p-[16px] shadow-[inset_0_0_0_1px_#eaeaea]">
          <ProductGrid onSelectProduct={handleSelectProduct} />
        </div>

        {/* Cart & checkout (right) — 45:2333 */}
        <div className="flex min-h-0 min-w-0 flex-col overflow-y-auto rounded-[12px] bg-white p-[16px] shadow-[inset_0_0_0_1px_#eaeaea]">
          <CartPanel
            cart={cart}
            onUpdateQuantity={handleUpdateQuantity}
            onSetQuantity={handleSetQuantity}
            onRemoveItem={handleRemoveItem}
            onClearCart={handleClearCart}
            onRestoreCart={handleRestoreCart}
          />
        </div>
      </div>
    </div>
  );
}
