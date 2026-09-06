import Trend from "./Trend";
import ProductImage from "@/components/shared/ProductImage";

/** Figma 77:21022 / 77:21024 — inventory / POS product tile. */
export default function ProductCard({
  name,
  price,
  stock,
  image,
  className = "",
}: {
  name: string;
  price: React.ReactNode;
  stock: React.ReactNode;
  image?: string;
  className?: string;
}) {
  return (
    <div
      className={`flex items-center overflow-clip rounded-[10px] p-[10px] outline-[0.6px] -outline-offset-[0.6px] outline-surface ${className}`}
    >
      <div className="flex w-[160px] flex-col items-center justify-center gap-[12px]">
        <div className="relative h-[160px] w-full overflow-hidden rounded-[8px] bg-surface/40 outline-[0.3px] -outline-offset-[0.3px] outline-surface">
          {image && (
            <ProductImage src={image} alt={name} sizes="160px" />
          )}
        </div>
        <div className="flex w-full flex-col items-start gap-[8px]">
          <p className="text-14 leading-[24px] whitespace-nowrap text-muted">{name}</p>
          <div className="flex w-full items-center justify-between">
            <p className="text-16 leading-[24px] font-medium whitespace-nowrap text-brand">
              {price}
            </p>
            <Trend>{stock}</Trend>
          </div>
        </div>
      </div>
    </div>
  );
}
