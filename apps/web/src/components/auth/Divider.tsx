export interface DividerProps {
  text?: string;
}

export default function Divider({ text = "或" }: DividerProps) {
  return (
    <div className="relative mb-7 flex items-center">
      <div className="h-px flex-grow bg-black/8 dark:bg-white/10" />
      <span className="mx-4 flex-shrink bg-[#f5f6f8] px-2 text-[11px] font-medium tracking-[0.14em] text-zinc-500 uppercase dark:bg-[#1a1d23] dark:text-zinc-400">
        {text}
      </span>
      <div className="h-px flex-grow bg-black/8 dark:bg-white/10" />
    </div>
  );
}
