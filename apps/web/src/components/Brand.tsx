export interface BrandProps {
  size?: "small" | "medium" | "large";
}

export default function Brand({ size = "medium" }: BrandProps) {
  const sizeClasses = {
    small: {
      container: "h-9 w-9 mb-3 rounded-[14px]",
      icon: "w-4 h-4",
      title: "text-xl",
      subtitle: "text-xs",
    },
    medium: {
      container: "h-11 w-11 mb-3 rounded-[14px]",
      icon: "w-5 h-5",
      title: "text-[1.75rem]",
      subtitle: "text-sm",
    },
    large: {
      container: "h-12 w-12 mb-4 rounded-[14px]",
      icon: "w-5 h-5",
      title: "text-[2.1rem]",
      subtitle: "text-sm",
    },
  };

  const classes = sizeClasses[size];

  return (
    <div className="flex flex-col items-start">
      <div className={`${classes.container} flex items-center justify-center border border-black/8 bg-white text-zinc-950 dark:border-white/10 dark:bg-[#20242b] dark:text-white`}>
        <svg className={classes.icon} viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
        </svg>
      </div>
      <div className={`${classes.title} font-semibold tracking-[-0.04em] text-zinc-950 dark:text-white`}>
        Reviewer
      </div>
      <p className={`${classes.subtitle} mt-1 text-zinc-500 dark:text-zinc-400`}>
        Precision AI for Code Reviews
      </p>
    </div>
  );
}
