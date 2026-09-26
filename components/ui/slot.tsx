'use client';

import * as React from 'react';

type AnyProps = Record<string, unknown>;

interface SlotProps extends React.HTMLAttributes<HTMLElement> {
  children?: React.ReactNode;
}

/**
 * Minimal `asChild` implementation: merges the single child element's props
 * with the props passed to the wrapper, so `<Button asChild><Link/></Button>`
 * forwards classes, handlers and refs to the real DOM node.
 */
export const Slot = React.forwardRef<HTMLElement, SlotProps>(function Slot(
  { children: slotChildren, ...slotProps },
  ref,
) {
  const child = React.Children.only(slotChildren) as React.ReactElement<AnyProps> | null;
  if (!child || !React.isValidElement(child)) return null;

  const childProps = (child.props ?? {}) as AnyProps;
  const slotBag = slotProps as AnyProps;
  // Child props win so the real element (href, aria-*, handlers) is preserved.
  // `children` intentionally comes from the child: the Button's own children ARE
  // this single child element, so re-assigning them would nest the element in
  // itself (e.g. `<a class="..."><a href="/login">…</a></a>`).
  const merged: AnyProps = { ...slotBag, ...childProps };

  // Compose event handlers so the consumer's handler always runs too.
  for (const key of Object.keys(childProps)) {
    const slotHandler = slotBag[key];
    const childHandler = childProps[key];
    if (
      /^on[A-Z]/.test(key) &&
      typeof slotHandler === 'function' &&
      typeof childHandler === 'function'
    ) {
      const sh = slotHandler as (...a: unknown[]) => unknown;
      const ch = childHandler as (...a: unknown[]) => unknown;
      merged[key] = (...args: unknown[]) => {
        ch(...args);
        sh(...args);
      };
    }
  }

  merged.ref = ref;

  return React.cloneElement(child, merged);
});
