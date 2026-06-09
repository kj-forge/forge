// Small pill badge for session status. Reused on home, history list, and the
// active session header so the visual language stays consistent. Colour pairs
// with an emoji so the meaning carries through color-blind / sun-glare cases.
export function StatusBadge({ endedAt }: { endedAt: Date | null }) {
  const inProgress = endedAt === null;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium text-[10px] ${
        inProgress
          ? "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300"
          : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
      }`}
    >
      {inProgress ? "W trakcie" : "Zakończona"}
    </span>
  );
}
