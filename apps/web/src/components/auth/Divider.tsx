export interface DividerProps {
  text?: string;
}

export default function Divider({ text = "或" }: DividerProps) {
  return (
    <div className="relative flex items-center mb-8">
      <div className="flex-grow border-t border-zinc-200 dark:border-zinc-700"></div>
      <span className="flex-shrink mx-4 text-[10px] font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
        {text}
      </span>
      <div className="flex-grow border-t border-zinc-200 dark:border-zinc-700"></div>
    </div>
  );
}
