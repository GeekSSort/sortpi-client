"use client";

import React, { useState } from "react";
import ProductGrid from "@/components/modules/pos/ProductGrid";
import CartPanel from "@/components/modules/pos/CartPanel";
import SelectedItems from "@/components/modules/pos/SelectedItems";
import { ProductItem, CartItem } from "@/types/pos";
import { usePosView } from "@/components/modules/pos/posView";

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
        {/* The product wall carries more per row than the other two columns:
            tiles have a minimum width of 150px, so at 1.6fr it fitted only two
            per row on a laptop while the cart and the invoice sat half empty.
            the extra width comes from the SELECTED ITEMS column, which holds
            two short columns and has room to spare, not from the invoice —
            that one carries the discount box, the coupon field and the
            totals, and narrowing it clipped their labels. */}
        <div className="grid h-full w-full min-h-0 grid-cols-1 gap-[16px] xl:grid-cols-[2.1fr_0.95fr_1.2fr]">
          <div className="flex min-h-0 min-w-0 flex-col overflow-y-auto rounded-[12px] bg-white p-[16px] shadow-[inset_0_0_0_1px_#eaeaea]">
            <ProductGrid onSelectProduct={handleSelectProduct} />
          </div>

          <div className="flex h-full min-h-0 min-w-0 flex-col">
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
