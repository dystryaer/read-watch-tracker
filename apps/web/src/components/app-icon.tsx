/** The app icon as an ImageResponse element: a teal tile with an open book (no image files needed). */
export function AppIcon({ size, rounded = true }: { size: number; rounded?: boolean }) {
  const page = { width: size * 0.3, height: size * 0.42, background: "#ffffff" };
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: size * 0.03,
        background: "#0f766e",
        borderRadius: rounded ? size * 0.2 : 0,
      }}
    >
      <div style={{ ...page, display: "flex", borderRadius: `${size * 0.04}px 0 0 ${size * 0.04}px` }} />
      <div style={{ ...page, display: "flex", borderRadius: `0 ${size * 0.04}px ${size * 0.04}px 0` }} />
    </div>
  );
}
