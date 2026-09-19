import { isValidElement } from "react"
import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

/*
 * House button. Two things make it ours:
 *
 *  - a 2px ink border and a hard, blur-free offset shadow
 *  - real motion: it lifts 2px toward the cursor on hover and slams flat on
 *    press, rather than fading a background colour
 *
 * Motion is suppressed under prefers-reduced-motion.
 */
const buttonVariants = cva(
  [
    "group/button relative inline-flex shrink-0 items-center justify-center gap-2",
    "font-display font-bold tracking-tight whitespace-nowrap select-none",
    "rounded-lg border-2 border-ink",
    "transition-[transform,box-shadow,background-color] duration-150 ease-[var(--ease-snap)]",
    "hover:-translate-x-[2px] hover:-translate-y-[2px]",
    "active:translate-x-[2px] active:translate-y-[2px] active:shadow-none",
    "motion-reduce:transform-none motion-reduce:transition-colors",
    "outline-none focus-visible:ring-4 focus-visible:ring-cobalt/40 focus-visible:ring-offset-2 focus-visible:ring-offset-paper",
    "disabled:pointer-events-none disabled:opacity-45 disabled:shadow-none",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ],
  {
    variants: {
      variant: {
        default:
          "bg-lime text-ink shadow-[3px_3px_0_var(--ink)] hover:shadow-[5px_5px_0_var(--ink)] hover:bg-[color-mix(in_srgb,var(--lime),white_12%)]",
        coral:
          "bg-coral text-ink shadow-[3px_3px_0_var(--ink)] hover:shadow-[5px_5px_0_var(--ink)] hover:bg-[color-mix(in_srgb,var(--coral),white_10%)]",
        ink: "bg-ink text-paper shadow-[3px_3px_0_var(--coral)] hover:shadow-[5px_5px_0_var(--coral)] hover:bg-[color-mix(in_srgb,var(--ink),white_12%)]",
        outline:
          "bg-paper-pure text-ink shadow-[3px_3px_0_var(--ink)] hover:shadow-[5px_5px_0_var(--ink)] hover:bg-lime-wash",
        secondary:
          "bg-paper-deep text-ink shadow-[3px_3px_0_var(--ink)] hover:shadow-[5px_5px_0_var(--ink)] hover:bg-lime-wash",
        destructive:
          "bg-danger text-white shadow-[3px_3px_0_var(--ink)] hover:shadow-[5px_5px_0_var(--ink)] hover:bg-[color-mix(in_srgb,var(--danger),white_10%)]",
        // Flat variants opt out of the border/shadow entirely.
        ghost:
          "border-transparent shadow-none hover:translate-x-0 hover:translate-y-0 active:translate-x-0 active:translate-y-0 hover:bg-lime-wash",
        link: "border-transparent shadow-none underline decoration-2 underline-offset-4 hover:translate-x-0 hover:translate-y-0 active:translate-x-0 active:translate-y-0 decoration-lime hover:decoration-coral",
      },
      size: {
        default: "h-11 px-5 text-sm",
        sm: "h-9 px-3.5 text-[0.8rem]",
        lg: "h-14 px-7 text-base",
        xl: "h-16 px-9 text-lg",
        icon: "size-11",
        "icon-sm": "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

/**
 * Base UI assumes it is rendering a real <button> unless told otherwise. When
 * we hand it a link through `render` — which is how every "button that
 * navigates" in this app is built — it warns, and the element ends up claiming
 * button semantics it does not have.
 *
 * Deciding it here rather than at each call site means a link-shaped button
 * added in a later phase is correct without anyone remembering this rule.
 */
function rendersNativeButton(render: unknown): boolean {
  if (!isValidElement(render)) return true
  return render.type === "button"
}

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      nativeButton={
        props.nativeButton ?? rendersNativeButton(props.render)
      }
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
