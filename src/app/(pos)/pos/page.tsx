"use client";

import React, { useState } from "react";
import ProductGrid from "@/components/modules/pos/ProductGrid";
import CartPanel from "@/components/modules/pos/CartPanel";
import SelectedItems from "@/components/modules/pos/SelectedItems";
import { ProductItem, CartItem } from "@/types/pos";
import { usePosView } from "@/components/modules/pos/posView";

/** Two panes, side by side. */
function TwoColumnIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <rect x="1.5" y="2.5" width="6.5" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="10" y="2.5" width="6.5" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

/** Three panes: products, basket, money. */
function ThreeColumnIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <rect x="1.5" y="2.5" width="4" height="13" rx="1.3" stroke="currentColor" strokeWidth="1.5" />
      <rect x="7" y="2.5" width="4" height="13" rx="1.3" stroke="currentColor" strokeWidth="1.5" />
      <rect x="12.5" y="2.5" width="4" height="13" rx="1.3" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

export default function PosPage() {
  const [cart, setCart] = useState<CartItem[]>([]);

  const view = usePosView();

  const handleSelectProduct = (product: ProductItem) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
  };

  const handleUpdateQuantity = (productId: string, delta: number) => {
    setCart((prev) => {
      return prev
        .map((item) => {
          if (item.product.id === productId) {
            const newQty = item.quantity + delta;
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
    setCart([]);
  };

  const handleRestoreCart = (items: CartItem[]) => {
    setCart(items);
  };

  if (view === "columns") {
    return (
      <div className="flex h-full w-full flex-col">
        {/* Products, what has been rung up, and the money — one job each. All
            three are as tall as the window and scroll inside themselves, so
            the page never scrolls as a whole. */}
        <div className="grid h-full w-full min-h-0 grid-cols-1 gap-[16px] xl:grid-cols-[1.6fr_1fr_1fr]">
          <div className="flex min-h-0 min-w-0 flex-col overflow-y-auto rounded-[12px] bg-white p-[16px] shadow-[inset_0_0_0_1px_#eaeaea]">
            <ProductGrid onSelectProduct={handleSelectProduct} />
          </div>

          <div className="min-h-0 min-w-0">
            <SelectedItems
              cart={cart}
              onUpdateQuantity={handleUpdateQuantity}
              onRemoveItem={handleRemoveItem}
              onClearCart={handleClearCart}
            />
          </div>

          <div className="flex min-h-0 min-w-0 flex-col overflow-y-auto rounded-[12px] bg-white p-[16px] shadow-[inset_0_0_0_1px_#eaeaea]">
            <CartPanel
              cart={cart}
              showItems={false}
              onUpdateQuantity={handleUpdateQuantity}
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
    <div className="flex h-full w-full flex-col">
      {/* pos-split (globals.css) keeps the designed 50/50 up to the design
          width, then pins the invoice column at its natural 565 so a wide
          monitor gives the extra pixels to the product grid instead. Both
          columns are as tall as the window and scroll inside themselves. */}
      <div className="pos-split grid h-full w-full min-h-0 grid-cols-1 gap-[31px]">
        {/* Product list (left) — 45:2171 */}
        <div className="flex min-h-0 min-w-0 flex-col overflow-y-auto">
          <ProductGrid onSelectProduct={handleSelectProduct} />
        </div>

        {/* Cart & checkout (right) — 45:2333 */}
        <div className="flex min-h-0 min-w-0 flex-col overflow-y-auto">
          <CartPanel
            cart={cart}
            onUpdateQuantity={handleUpdateQuantity}
            onRemoveItem={handleRemoveItem}
            onClearCart={handleClearCart}
            onRestoreCart={handleRestoreCart}
          />
        </div>
      </div>
    </div>
  );
}
