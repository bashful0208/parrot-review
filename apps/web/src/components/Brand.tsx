export interface BrandProps {
  size?: "small" | "medium" | "large";
}

export default function Brand({ size = "medium" }: BrandProps) {
  const sizeClasses = {
    small: {
      container: "w-8 h-8 mb-2",
      icon: "text-lg",
      title: "text-xl",
      subtitle: "text-xs",
    },
    medium: {
      container: "w-12 h-12 mb-6",
      icon: "text-2xl",
      title: "text-3xl",
      subtitle: "text-sm",
    },
    large: {
      container: "w-16 h-16 mb-8",
      icon: "text-3xl",
      title: "text-4xl",
      subtitle: "text-base",
    },
  };

  const classes = sizeClasses[size];

  return (
    <div className="flex flex-col items-center">
      <div className={`${classes.container} rounded-lg bg-foreground text-background flex items-center justify-center shadow-lg shadow-primary/20`}>
        <svg className={`w-6 h-6 ${classes.icon}`} viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
        </svg>
      </div>
      <h1 className={`${classes.title} font-extrabold tracking-tight text-foreground mb-2 font-sans`}>
        Reviewer
      </h1>
      <p className={`${classes.subtitle} text-zinc-600 dark:text-zinc-400 tracking-wide font-medium`}>
        Precision AI for Code Reviews
      </p>
    </div>
  );
}
