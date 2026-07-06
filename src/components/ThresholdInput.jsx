export default function ThresholdInput({ value, onChange }) {
  function handleChange(e) {
    const raw = e.target.value;
    if (raw === "") {
      onChange(0);
      return;
    }
    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed < 0) return;
    onChange(parsed);
  }

  return (
    <label className="threshold-input">
      Umbral de stock (productos con stock ≤ este valor van al fondo)
      <input type="number" min="0" step="1" value={value} onChange={handleChange} />
    </label>
  );
}
