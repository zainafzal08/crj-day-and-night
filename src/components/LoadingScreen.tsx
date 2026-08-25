export function LoadingScreen({ visible }: { visible: boolean }) {
  return (
    <div
      className={`loading-screen${visible ? "" : " loading-screen--hidden"}`}
      role="status"
      aria-label="Loading album artwork"
      aria-hidden={!visible}
    >
      <span className="loading-spinner" aria-hidden="true" />
    </div>
  );
}
