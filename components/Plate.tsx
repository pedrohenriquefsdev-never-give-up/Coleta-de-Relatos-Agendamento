export default function Plate({ value, compact = false }: { value: string; compact?: boolean }) {
  const plate = (value || "BRA2E19").toUpperCase();
  return (
    <div className={`vehicle-plate ${compact ? "compact" : ""}`} aria-label={`Placa ${plate}`}>
      <div className="plate-top"><span>BRASIL</span><span>PORTAL</span></div>
      <div className="plate-value">{plate}</div>
    </div>
  );
}
