import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium transition-all duration-200 active:scale-[0.98] outline-none focus-visible:ring-2 focus-visible:ring-[var(--nx-purple)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--nx-bg)] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "bg-[var(--nx-purple)] text-white hover:bg-[var(--nx-purple-hover)] active:bg-[var(--nx-purple-active)]",
        accent:
          "bg-[var(--nx-accent)] text-[var(--nx-accent-fg)] hover:bg-[var(--nx-accent-hover)] active:bg-[var(--nx-accent-active)]",
        secondary:
          "bg-[var(--nx-elevated)] text-[var(--nx-text)] border border-[var(--nx-border)] hover:bg-[var(--nx-elevated-hover)] hover:border-[var(--nx-border-strong)]",
        outline:
          "border border-[var(--nx-border)] bg-transparent text-[var(--nx-text)] hover:bg-[var(--nx-border-subtle)]",
        ghost:
          "bg-transparent text-[var(--nx-text-muted)] hover:bg-[var(--nx-border-subtle)] hover:text-[var(--nx-text)]",
        danger: "bg-[var(--nx-error)] text-white hover:bg-[var(--nx-error)]",
      },
      size: {
        sm: "h-7 px-2.5 text-[12px] [&_svg]:size-3.5",
        md: "h-8 px-3 text-[13px] [&_svg]:size-4",
        lg: "h-10 px-4 text-[14px] [&_svg]:size-4",
        icon: "h-8 w-8 [&_svg]:size-4",
        "icon-sm": "h-7 w-7 [&_svg]:size-3.5",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean };

export function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { buttonVariants };
