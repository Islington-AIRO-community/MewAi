import * as React from 'react';
import { cn } from '@/lib/utils';
import { Eyebrow } from '@/components/ui/primitives';

export function Card({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'relative rounded-2xl border border-navy-200/80 bg-white shadow-soft',
        'transition-shadow duration-300 ease-calm',
        className,
      )}
      {...props}
    />
  );
}

/**
 * The header strip of a card-like container: a rule underneath, the title block
 * on the left, an optional trailing slot on the right.
 *
 * Five sites hand-rolled this row across two paddings and three title sizes, and
 * the `<h2>`/`<h3>` level was chosen per file rather than per outline, which is
 * how `/dashboard` ended up with card headings competing with its page title.
 * `titleAs` on `CardTitle` makes that choice explicit at the call site instead.
 *
 * The icon is a node rather than an `icon` prop on purpose: four of the five
 * sites want a tinted rounded chip and one wants a bare glyph, and the chip
 * colour is semantic (navy = neutral, relief = done, dispatch = the AI). The
 * primitive owns the row; the caller owns the chip.
 *
 * It is named for `Card` but used in one place that is not a `Card` — the
 * ticket review panel is a bare `motion.div`. The strip is the same shape and
 * the same rule, and duplicating it to keep the name honest would be worse.
 */
export function CardHeader({
  icon,
  actions,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  icon?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 border-b border-navy-100 px-5 py-4 sm:px-6',
        className,
      )}
      {...props}
    >
      <div className="flex min-w-0 items-center gap-3">
        {icon}
        <div className="min-w-0">{props.children}</div>
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/**
 * The heading inside a `CardHeader`. The level is a prop because it is a
 * structural decision, not a style one — pass the level that keeps the page's
 * outline unbroken, and let the class be the same everywhere.
 */
export function CardTitle({
  titleAs: Tag = 'h3',
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement> & {
  titleAs?: 'h2' | 'h3' | 'h4';
}) {
  return (
    <Tag
      className={cn('flex items-center gap-2 text-sm font-bold tracking-tight text-navy-900', className)}
      {...props}
    />
  );
}

/** The sub-line under a `CardTitle`. Optional; many headers have no trailing line. */
export function CardDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('mt-0.5 text-xs text-navy-500', className)} {...props} />;
}

/** The body of a `Card` whose header is a `CardHeader`. */
export function CardContent({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-5 py-5 sm:px-6 sm:py-6', className)} {...props} />;
}

/** A rule-separated strip after a `CardContent` — actions, or a demo control. */
export function CardFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-3 border-t border-navy-100 bg-navy-50/50 px-5 py-3.5 sm:px-6',
        className,
      )}
      {...props}
    />
  );
}

/**
 * A titled strip inside a card: a rule, an eyebrow, then the body.
 *
 * Lives here rather than in `patterns.tsx` because it is a card sub-pattern and
 * every caller already imports `Card` — putting it in a module of its own
 * would make a route pay for the page-level primitives it does not use. That is
 * a real cost, not a theoretical one: bundling all seven page primitives
 * together cost the `/reports` route about a kilobyte for icons it never
 * rendered.
 *
 * Five sites in `reports/[id]`'s sidebar built this by hand across three
 * paddings, and the ones that used a `<label>` for the title had no `<h2>` at
 * all — the whole sidebar was a sequence of unlabelled divs. Two of the five
 * are title-only, with the body as a *sibling* below (the map and the assigned
 * unit both want their own padding), which is why `children` is optional.
 *
 * `last:border-b-0` is load-bearing: a card of nothing but two sections would
 * otherwise end on a dangling hairline against the card edge.
 */
export function CardSection({
  title,
  children,
  className,
  titleAs: TitleTag = 'h3',
  headingId,
}: {
  title?: string;
  children?: React.ReactNode;
  className?: string;
  titleAs?: 'h2' | 'h3' | 'h4';
  headingId?: string;
}) {
  return (
    <div className={cn('border-b border-navy-100 px-5 py-4 last:border-b-0', className)}>
      {title ? (
        <Eyebrow as={TitleTag} id={headingId} className="text-navy-400">
          {title}
        </Eyebrow>
      ) : null}
      {children}
    </div>
  );
}
