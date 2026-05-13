export interface DividerProps {
  text?: string;
}

export default function Divider({ text = "or" }: DividerProps) {
  return (
    <div className="relative my-6 flex items-center">
      <div className="flex-1 border-t border-gray-300 dark:border-gray-600" />
      <span className="mx-4 text-sm text-gray-500 dark:text-gray-400">
        {text}
      </span>
      <div className="flex-1 border-t border-gray-300 dark:border-gray-600" />
    </div>
  );
}
