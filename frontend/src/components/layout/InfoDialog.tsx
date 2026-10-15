import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { IconButton } from '../common/Button';

interface InfoDialogProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

export function InfoDialog({ open, title, onClose, children }: InfoDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={(event) => event.target === dialogRef.current && onClose()}
      aria-labelledby={titleId}
      className="m-auto w-[min(560px,calc(100vw-32px))] rounded-card border border-line bg-surface p-0 text-ink shadow-float backdrop:bg-ink/40"
    >
      <div className="flex items-center justify-between border-b border-line px-5 py-3">
        <h2 id={titleId} className="text-section">
          {title}
        </h2>
        <IconButton label="Close" onClick={onClose}>
          <X />
        </IconButton>
      </div>
      <div className="max-h-[70vh] overflow-y-auto px-5 py-4 text-body text-ink-secondary">{children}</div>
    </dialog>
  );
}

const RISK_THRESHOLD_ROWS: [string, string, string, string, string, string][] = [
  ['Wind', '< 25 mph', '25–34', '35–44', '45–54', '≥ 55 mph'],
  ['Rain', '< 0.10 in/hr', '0.10–0.25', '0.25–0.50', '0.50–1.00', '> 1.00'],
  ['Snow', '< 0.5 in/hr', '0.5–1.0', '1.0–2.0', '2.0–3.0', '> 3.0'],
];

export function AboutContent() {
  return (
    <div className="flex flex-col gap-4">
      <p>
        Truck Route Planner compares three alternative routes and recommends the safest one. Weather is sampled at
        checkpoints along each route using the truck’s estimated arrival time at each checkpoint.
      </p>
      <div>
        <h3 className="text-card text-ink">Risk thresholds</h3>
        <div className="mt-2 overflow-x-auto rounded-control border border-line">
          <table className="w-full min-w-[460px] text-label tabular-nums">
            <thead className="bg-surface-muted text-ink">
              <tr>
                {['Condition', 'Low', 'Moderate', 'High', 'Severe', 'No Travel'].map((heading) => (
                  <th key={heading} scope="col" className="px-2.5 py-1.5 text-left font-semibold">
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {RISK_THRESHOLD_ROWS.map(([condition, ...bands]) => (
                <tr key={condition} className="border-t border-line">
                  <th scope="row" className="px-2.5 py-1.5 text-left font-semibold text-ink">
                    {condition}
                  </th>
                  {bands.map((band, bandIndex) => (
                    <td key={bandIndex} className="px-2.5 py-1.5">
                      {band}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-label text-ink-muted">A value on a shared boundary belongs to the higher band.</p>
      </div>
      <div>
        <h3 className="text-card text-ink">Load rules</h3>
        <ul className="mt-1 list-disc pl-5">
          <li>Wind ≥ 55 mph → No Travel for any load</li>
          <li>Wind 45–54 mph with a load over 30,000 lb → No Travel</li>
          <li>Wind 35–44 mph with a load over 40,000 lb → Severe</li>
        </ul>
      </div>
      <div>
        <h3 className="text-card text-ink">Recommendation</h3>
        <p className="mt-1">Routes with any No Travel miles are never recommended. The rest are ranked by:</p>
        <ol className="mt-1 list-decimal pl-5">
          <li>Fewest Severe miles</li>
          <li>Fewest High miles</li>
          <li>Lowest average risk (distance-weighted, Low = 0 … No Travel = 4)</li>
          <li>Shortest travel time</li>
        </ol>
      </div>
    </div>
  );
}

export function HelpContent() {
  return (
    <div className="flex flex-col gap-4">
      <ol className="list-decimal pl-5 [&>li]:mt-1">
        <li>Enter the origin, destination, departure time, and load weight.</li>
        <li>Choose how often to sample the weather: every 10, 25, or 50 miles.</li>
        <li>Select <span className="font-semibold text-ink">Find Routes</span>. The recommended route is highlighted.</li>
        <li>Click a route card or a route on the map to compare it. Its checkpoints appear in the table.</li>
        <li>Click a checkpoint row or a dot on the map to see the weather and the reason for its risk level.</li>
      </ol>
      <div>
        <h3 className="text-card text-ink">Weather layers and the forecast slider</h3>
        <p className="mt-1">
          Use the layer list on the map to show combined weather, wind, precipitation, snow, or clouds. Drag the slider to
          see conditions from departure up to 48 hours later. The slider changes the map only; each checkpoint’s risk
          always uses the forecast at the truck’s arrival time.
        </p>
      </div>
      <div>
        <h3 className="text-card text-ink">Map colors</h3>
        <p className="mt-1">
          Routes 1, 2, and 3 are blue, green, and red. Dots on the selected route are colored by risk: green Low, yellow
          Moderate, orange High, red Severe, dark red No Travel.
        </p>
      </div>
    </div>
  );
}
