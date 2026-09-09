"use client";

import Button from "@/components/ui/Button";
import Field from "@/components/ui/Field";
import StatCard from "@/components/ui/StatCard";
import DateField from "@/components/ui/DateField";
import ProductCard from "@/components/ui/ProductCard";

/**
 * Living reference for the design system (Figma node 77:20535). Every
 * primitive renders here, so Chromatic snapshots them on each build and a
 * regression in a shared component is caught even if no page uses it yet.
 */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-[16px]">
      <h2 className="text-14 font-medium text-muted">{title}</h2>
      <div className="flex flex-wrap items-start gap-[16px]">{children}</div>
    </section>
  );
}

export default function DesignSystemPreview() {
  return (
    <div className="flex flex-col gap-[40px] pb-10">
      <Section title="Colour">
        {[
          { name: "brand", cls: "bg-brand" },
          { name: "surface", cls: "bg-surface" },
          { name: "muted", cls: "bg-muted" },
          { name: "ink", cls: "bg-ink" },
          { name: "canvas", cls: "bg-canvas" },
        ].map(({ name, cls }) => (
          <div key={name} className="flex flex-col gap-[8px]">
            <div className={`size-[80px] rounded-[10px] border border-surface ${cls}`} />
            <span className="text-12 text-muted">{name}</span>
          </div>
        ))}
      </Section>

      <Section title="Type scale">
        {/* Written out rather than interpolated: Tailwind only emits classes
            it can find as complete strings in the source. */}
        <div className="flex flex-col gap-[8px] text-muted">
          <p className="text-12">12px — Geist regular</p>
          <p className="text-14">14px — Geist regular</p>
          <p className="text-16">16px — Geist regular</p>
          <p className="text-18">18px — Geist regular</p>
          <p className="text-20">20px — Geist regular</p>
          <p className="text-24">24px — Geist regular</p>
          <p className="text-32">32px — Geist regular</p>
        </div>
      </Section>

      <Section title="Elevation">
        <div className="flex size-[100px] items-center justify-center rounded-[10px] bg-white text-12 text-muted shadow-e50">
          e50
        </div>
        <div className="flex size-[100px] items-center justify-center rounded-[10px] bg-white text-12 text-muted shadow-e100">
          e100
        </div>
        <div className="flex size-[100px] items-center justify-center rounded-[10px] bg-white text-12 text-muted shadow-e200">
          e200
        </div>
      </Section>

      <Section title="Field">
        <div className="w-full max-w-[501px]">
          <Field label="Label" defaultValue="samcurrent@gmail.com" />
        </div>
      </Section>

      <Section title="Button">
        <div className="w-full max-w-[501px]">
          <Button>Button</Button>
        </div>
      </Section>

      <Section title="Date field">
        <DateField value="24 August 2026" />
        <DateField value="24 August 2026" variant="outline" />
      </Section>

      <Section title="Stat card">
        <StatCard
          className="w-[278px]"
          title="write title here"
          value="৳ 0,00"
          trend="↑ 12.5% vs. last month"
        />
      </Section>

      <Section title="Product card">
        <ProductCard name="write product name" price="৳0,00" stock="Stock 00" />
        <ProductCard name="Wireless Headphone" price="৳2,450" stock="Stock 24" />
      </Section>
    </div>
  );
}
