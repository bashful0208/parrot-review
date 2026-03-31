import { forwardRef, InputHTMLAttributes } from "react";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className, id, type = "text", ...props }, ref) => {
    const inputId = id || label.toLowerCase().replace(/\s+/g, "-");

    return (
      <div className="mb-4">
        <label
          htmlFor={inputId}
          className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2"
        >
          {label}
        </label>
        <input
          id={inputId}
          type={type}
          ref={ref}
          className={`
            w-full px-4 py-3 rounded-lg border
            bg-white dark:bg-black
            text-zinc-900 dark:text-zinc-50
            placeholder-zinc-400 dark:placeholder-zinc-500
            border-zinc-200 dark:border-zinc-700
            focus:border-zinc-500 dark:focus:border-zinc-400
            focus:ring-2 focus:ring-zinc-200 dark:focus:ring-zinc-800
            focus:ring-offset-2 dark:focus:ring-offset-zinc-900
            transition-colors duration-200
            ${error ? "border-red-500 dark:border-red-400" : ""}
            ${className || ""}
          `}
          {...props}
        />
        {error && (
          <p className="mt-1 text-sm text-red-600 dark:text-red-400">{error}</p>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";

export default Input;
