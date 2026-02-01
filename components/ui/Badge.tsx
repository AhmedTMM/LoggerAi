import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
    "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold transition-colors",
    {
        variants: {
            variant: {
                default: "border-transparent bg-blue-100 text-blue-700",
                secondary: "border-transparent bg-zinc-100 text-zinc-700",
                destructive: "border-transparent bg-red-100 text-red-700",
                outline: "text-zinc-700 border-zinc-300",
                success: "border-transparent bg-emerald-100 text-emerald-700",
                warning: "border-transparent bg-amber-100 text-amber-700",
                error: "border-transparent bg-red-100 text-red-700",
                neutral: "border-transparent bg-zinc-100 text-zinc-700",
            },
        },
        defaultVariants: {
            variant: "default",
        },
    }
);

export interface BadgeProps
    extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> { }

function Badge({ className, variant, ...props }: BadgeProps) {
    return (
        <div className={cn(badgeVariants({ variant }), className)} {...props} />
    );
}

export { Badge, badgeVariants };
