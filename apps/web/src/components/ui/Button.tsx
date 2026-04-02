import { ButtonHTMLAttributes, forwardRef } from "react";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline";
  loading?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      loading = false,
      children,
      disabled,
      className,
      type = "button",
      ...props
    },
    ref
  ) => {
    const baseStyles =
      "inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 font-medium transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

    const variantStyles = {
      primary:
        "bg-zinc-950 text-white hover:bg-zinc-800 focus:ring-zinc-300 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white dark:focus:ring-zinc-700",
      secondary:
        "bg-white text-zinc-900 hover:bg-zinc-50 focus:ring-zinc-200 dark:bg-[#20242b] dark:text-zinc-100 dark:hover:bg-[#262b33] dark:focus:ring-zinc-800",
      outline:
        "border border-black/8 bg-white text-zinc-900 hover:bg-zinc-50 focus:ring-zinc-200 dark:border-white/10 dark:bg-[#20242b] dark:text-zinc-100 dark:hover:bg-[#262b33] dark:focus:ring-zinc-800",
    };

    return (
      <button
        type={type}
        ref={ref}
        disabled={disabled || loading}
        className={`${baseStyles} ${variantStyles[variant]} ${className || ""}`}
        {...props}
      >
        {loading && (
          <svg
            className="h-5 w-5 animate-spin"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V8C4 4 4 4 12 12z"
            />
          </svg>
        )}
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";

export default Button;
