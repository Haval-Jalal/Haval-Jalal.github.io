// The site mark: a small glowing ember, the same glow as the Nu dot in the nav and the core of
// Javal, the AI assistant. Used wherever the name needs a mark: nav, Haval OS, admin, pitch pages.
export function Mark({ size = 10, className = "" }: { size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block shrink-0 rounded-full ${className}`}
      style={{
        width: size,
        height: size,
        background: "radial-gradient(circle at 35% 35%, #ffd39a, #e8933a 55%, #a9521c)",
        boxShadow: `0 0 ${Math.round(size * 1.4)}px rgba(232,147,58,.7)`,
      }}
    />
  );
}
