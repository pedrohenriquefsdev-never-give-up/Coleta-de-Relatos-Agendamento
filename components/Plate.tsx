export default function Plate({ value, compact = false, wide = false }: { value: string; compact?: boolean; wide?: boolean }) {
  const plate = (value || "BRA2E19").toUpperCase();
  const long = plate.length > 9;
  return (
    <div className={`vehicle-plate ${compact ? "compact" : ""} ${wide ? "wide" : ""} ${long ? "long" : ""}`} aria-label={`Placa ${plate}`}>
      <div className="plate-top"><span>BRASIL</span><span>PORTAL</span></div>
      <div className="plate-value">{plate}</div>
    </div>
  );
}
