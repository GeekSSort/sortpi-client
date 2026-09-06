"use client";

import React from "react";
import { SkeletonLine } from "./Skeleton";

/**
 * The three states a screen can be in once the sample data is gone, and one
 * consistent way to render each.
 *
 * Before, every screen invented its own: some showed a blank table on failure,
 * some showed stale sample rows, one showed nothing at all and looked like an
 * empty account. With the fallbacks removed a failed request has to SAY so,
 * because otherwise "the server is down" and "you have no customers yet" are
 * the same picture — and the second one invites someone to add a customer that
 * already exists.
 */

/**
 * A hairline that creeps across the top while a refresh runs UNDER content
 * already on screen. Deliberately not a spinner and not a blocking overlay:
 * the rows are still valid and still usable, something newer is merely on its
 * way. Only shown when there is content; a first load gets a skeleton instead.
 */
export function RefreshBar({ active }: { active: boolean }) {
  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-0 h-[2px] overflow-hidden"
      aria-hidden
    >
      <div
        className={`h-full w-full origin-left bg-[#c9a227] transition-opacity duration-200 ${
          active ? "animate-[sp-indeterminate_1.1s_ease-in-out_infinite] opacity-100" : "opacity-0"
        }`}
      />
    </div>
  );
}

/** Something went wrong, said plainly, with the one action that helps. */
export function ErrorState({
  message,
  onRetry,
  compact = false,
}: {
  message: string;
  onRetry?: () => void;
  compact?: boolean;
}) {
  return (
    <div
      role="alert"
      className={`flex flex-col items-center justify-center gap-[10px] text-center ${
        compact ? "py-[28px]" : "py-[56px]"
      }`}
    >
      <p className="text-[14px] leading-[1.5] font-medium tracking-[-0.28px] text-[#1e1e1e]">
        {message}
      </p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-[8px] border border-solid border-[#eaeaea] px-[16px] py-[8px] text-[13px] font-medium text-[#525252] transition-colors hover:bg-[#fafafa]"
        >
          Try again
        </button>
      )}
    </div>
  );
}

/** No rows, and that is the truth rather than a failure. */
export function EmptyState({
  message,
  hint,
  compact = false,
}: {
  message: string;
  hint?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-[6px] text-center ${
        compact ? "py-[28px]" : "py-[56px]"
      }`}
    >
      <p className="text-[14px] leading-[1.5] font-medium tracking-[-0.28px] text-[#525252]">
        {message}
      </p>
      {hint && (
        <p className="text-[13px] leading-[1.5] tracking-[-0.26px] text-[#9e9e9e]">{hint}</p>
      )}
    </div>
  );
}

/**
 * Skeleton, then error, then content — in that order, once, so no screen has
 * to re-derive it.
 *
 * `hasData` rather than a truthiness check on the data: an empty array is a
 * real answer and must not be mistaken for "still loading".
 */
export function QueryBoundary({
  loading,
  error,
  hasData,
  skeleton,
  errorMessage,
  onRetry,
  children,
}: {
  loading: boolean;
  error: unknown;
  hasData: boolean;
  skeleton: React.ReactNode;
  errorMessage: string;
  onRetry?: () => void;
  children: React.ReactNode;
}) {
  if (loading && !hasData) return <>{skeleton}</>;
  // An error with rows behind it is shown beside them, not instead of them —
  // handled by the caller. Only a failure with nothing to show takes over.
  if (error && !hasData) return <ErrorState message={errorMessage} onRetry={onRetry} />;
  return <>{children}</>;
}

/** A one-line placeholder for a value inside otherwise-loaded chrome. */
export function ValueSkeleton({ width = 96 }: { width?: number }) {
  return <SkeletonLine width={width} height={14} />;
}
