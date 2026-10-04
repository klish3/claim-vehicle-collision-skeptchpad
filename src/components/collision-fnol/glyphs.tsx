import type { ObjectKind, VehicleKind } from './types';
import { OBJECT_SPECS, VEHICLE_SPECS } from './diagram';

/*
 * Top-down glyphs drawn in METRES, centred on (0,0), front pointing up (-y).
 * Styling uses presentation attributes only so the SVG can be serialised
 * into the payload and still render without the stylesheet.
 */

const GLASS = '#d7e8f7';
const OUTLINE = '#111827';

export function VehicleGlyph({ kind, colour }: { kind: VehicleKind; colour: string }) {
  const { length: L, width: W } = VEHICLE_SPECS[kind];
  const t = -L / 2; // front
  const b = L / 2; // back
  const l = -W / 2;
  const r = W / 2;

  switch (kind) {
    case 'CAR':
      return (
        <g>
          <rect
            x={l - 0.16}
            y={t + 1.25}
            width={W + 0.32}
            height={0.28}
            rx={0.08}
            fill={colour}
            stroke={OUTLINE}
            strokeWidth={0.05}
          />
          <rect x={l} y={t} width={W} height={L} rx={0.55} fill={colour} stroke={OUTLINE} strokeWidth={0.07} />
          <path
            d={`M ${l + 0.2} ${t + 1.3} Q 0 ${t + 0.95} ${r - 0.2} ${t + 1.3} L ${r - 0.3} ${t + 1.9} L ${l + 0.3} ${t + 1.9} Z`}
            fill={GLASS}
          />
          <rect x={l + 0.3} y={t + 1.98} width={W - 0.6} height={1.25} rx={0.18} fill="#ffffff" opacity={0.18} />
          <path
            d={`M ${l + 0.3} ${b - 1.1} L ${r - 0.3} ${b - 1.1} L ${r - 0.22} ${b - 0.62} Q 0 ${b - 0.46} ${l + 0.22} ${b - 0.62} Z`}
            fill={GLASS}
          />
          <rect x={l + 0.14} y={t + 0.06} width={0.46} height={0.18} rx={0.07} fill="#fff7c2" />
          <rect x={r - 0.6} y={t + 0.06} width={0.46} height={0.18} rx={0.07} fill="#fff7c2" />
          <rect x={l + 0.14} y={b - 0.2} width={0.4} height={0.13} rx={0.05} fill="#ef4444" />
          <rect x={r - 0.54} y={b - 0.2} width={0.4} height={0.13} rx={0.05} fill="#ef4444" />
        </g>
      );
    case 'VAN':
      return (
        <g>
          <rect x={l} y={t} width={W} height={L} rx={0.35} fill={colour} stroke={OUTLINE} strokeWidth={0.07} />
          <path
            d={`M ${l + 0.18} ${t + 0.75} Q 0 ${t + 0.5} ${r - 0.18} ${t + 0.75} L ${r - 0.25} ${t + 1.3} L ${l + 0.25} ${t + 1.3} Z`}
            fill={GLASS}
          />
          <rect x={l + 0.18} y={t + 1.5} width={W - 0.36} height={L - 1.7} rx={0.12} fill="#ffffff" opacity={0.22} />
          {[0.25, 0.5, 0.75].map((f) => (
            <line
              key={f}
              x1={l + 0.18}
              x2={r - 0.18}
              y1={t + 1.5 + (L - 1.7) * f}
              y2={t + 1.5 + (L - 1.7) * f}
              stroke={OUTLINE}
              strokeOpacity={0.25}
              strokeWidth={0.05}
            />
          ))}
          <rect x={l + 0.14} y={t + 0.06} width={0.46} height={0.18} rx={0.07} fill="#fff7c2" />
          <rect x={r - 0.6} y={t + 0.06} width={0.46} height={0.18} rx={0.07} fill="#fff7c2" />
        </g>
      );
    case 'LORRY':
      return (
        <g>
          <rect x={l} y={t} width={W} height={2.3} rx={0.3} fill={colour} stroke={OUTLINE} strokeWidth={0.08} />
          <rect x={l + 0.2} y={t + 0.35} width={W - 0.4} height={0.55} rx={0.1} fill={GLASS} />
          <rect
            x={l}
            y={t + 2.45}
            width={W}
            height={L - 2.45}
            rx={0.15}
            fill="#e5e7eb"
            stroke={OUTLINE}
            strokeWidth={0.08}
          />
          <rect x={l + 0.12} y={t + 2.57} width={W - 0.24} height={L - 2.69} fill={colour} opacity={0.35} />
        </g>
      );
    case 'BUS':
      return (
        <g>
          <rect x={l} y={t} width={W} height={L} rx={0.45} fill={colour} stroke={OUTLINE} strokeWidth={0.08} />
          <rect x={l + 0.18} y={t + 0.2} width={W - 0.36} height={0.6} rx={0.12} fill={GLASS} />
          <rect x={l + 0.35} y={t + 1.3} width={W - 0.7} height={L - 2.2} rx={0.2} fill="#ffffff" opacity={0.2} />
          <rect x={-0.45} y={t + 3} width={0.9} height={0.9} rx={0.1} fill={OUTLINE} opacity={0.25} />
          <rect x={-0.45} y={b - 3.6} width={0.9} height={0.9} rx={0.1} fill={OUTLINE} opacity={0.25} />
        </g>
      );
    case 'MOTORCYCLE':
      return (
        <g>
          <rect x={-0.1} y={t} width={0.2} height={0.55} rx={0.08} fill={OUTLINE} />
          <rect x={-0.12} y={b - 0.55} width={0.24} height={0.55} rx={0.08} fill={OUTLINE} />
          <line x1={l} x2={r} y1={t + 0.55} y2={t + 0.55} stroke={OUTLINE} strokeWidth={0.08} strokeLinecap="round" />
          <ellipse cx={0} cy={0} rx={0.26} ry={0.7} fill={colour} stroke={OUTLINE} strokeWidth={0.05} />
          <circle cx={0} cy={0.12} r={0.2} fill="#f9fafb" stroke={OUTLINE} strokeWidth={0.05} />
        </g>
      );
    case 'BICYCLE':
      return (
        <g>
          <line x1={0} x2={0} y1={t} y2={t + 0.65} stroke={OUTLINE} strokeWidth={0.07} strokeLinecap="round" />
          <line x1={0} x2={0} y1={b - 0.65} y2={b} stroke={OUTLINE} strokeWidth={0.07} strokeLinecap="round" />
          <line x1={0} x2={0} y1={t + 0.4} y2={b - 0.4} stroke={colour} strokeWidth={0.1} />
          <line x1={l} x2={r} y1={t + 0.45} y2={t + 0.45} stroke={OUTLINE} strokeWidth={0.06} strokeLinecap="round" />
          <circle cx={0} cy={0.05} r={0.18} fill={colour} stroke={OUTLINE} strokeWidth={0.04} />
        </g>
      );
  }
}

export function ObjectGlyph({ kind, length }: { kind: ObjectKind; length: number }) {
  const { width: W } = OBJECT_SPECS[kind];
  const hl = length / 2;
  switch (kind) {
    case 'WALL': {
      const bricks = Math.max(1, Math.round(length / 0.6));
      return (
        <g>
          <rect x={-hl} y={-W / 2} width={length} height={W} fill="#b45309" stroke="#7c2d12" strokeWidth={0.06} />
          {Array.from({ length: bricks - 1 }, (_, i) => {
            const x = -hl + ((i + 1) * length) / bricks;
            return <line key={i} x1={x} x2={x} y1={-W / 2} y2={W / 2} stroke="#7c2d12" strokeWidth={0.04} />;
          })}
        </g>
      );
    }
    case 'FENCE': {
      const posts = Math.max(2, Math.round(length) + 1);
      return (
        <g>
          <line x1={-hl} x2={hl} y1={0} y2={0} stroke="#a16207" strokeWidth={0.12} />
          {Array.from({ length: posts }, (_, i) => {
            const x = -hl + (i * length) / (posts - 1);
            return <rect key={i} x={x - 0.1} y={-0.1} width={0.2} height={0.2} fill="#713f12" />;
          })}
        </g>
      );
    }
    case 'BARRIER': {
      const posts = Math.max(2, Math.round(length / 2) + 1);
      return (
        <g>
          <rect
            x={-hl}
            y={-W / 2}
            width={length}
            height={W}
            rx={0.08}
            fill="#d1d5db"
            stroke="#4b5563"
            strokeWidth={0.06}
          />
          {Array.from({ length: posts }, (_, i) => {
            const x = -hl + (i * length) / (posts - 1);
            return <rect key={i} x={x - 0.08} y={-0.08} width={0.16} height={0.16} fill="#4b5563" />;
          })}
        </g>
      );
    }
    case 'LAMP_POST':
      return (
        <g>
          <line x1={0} y1={0} x2={0} y2={-1.6} stroke="#374151" strokeWidth={0.12} strokeLinecap="round" />
          <ellipse cx={0} cy={-1.7} rx={0.22} ry={0.32} fill="#fde68a" stroke="#374151" strokeWidth={0.05} />
          <circle r={0.25} fill="#374151" />
        </g>
      );
    case 'BOLLARD':
      return <circle r={0.2} fill="#111827" stroke="#facc15" strokeWidth={0.07} />;
    case 'SIGN':
      return (
        <g>
          <path
            d="M 0 -0.42 L 0.45 0.36 L -0.45 0.36 Z"
            fill="#ffffff"
            stroke="#dc2626"
            strokeWidth={0.1}
            strokeLinejoin="round"
          />
          <circle r={0.07} fill="#374151" />
        </g>
      );
    case 'TREE':
      return (
        <g>
          {[
            [0, -0.9, 1.2],
            [0.9, 0.2, 1.1],
            [-0.9, 0.2, 1.1],
            [0, 0.9, 1.1],
            [0, 0, 1.3],
          ].map(([cx, cy, rr], i) => (
            <circle key={i} cx={cx} cy={cy} r={rr} fill="#4d7c0f" opacity={0.8} />
          ))}
          <circle r={0.3} fill="#78350f" />
        </g>
      );
    case 'ANIMAL':
      return (
        <g fill="#92400e" stroke="#451a03" strokeWidth={0.04}>
          <ellipse cx={0} cy={0.1} rx={0.28} ry={0.6} />
          <ellipse cx={0} cy={-0.62} rx={0.15} ry={0.2} />
          <path d="M -0.1 -0.78 L -0.24 -0.95 M 0.1 -0.78 L 0.24 -0.95" fill="none" strokeWidth={0.05} />
          <line x1={0} y1={0.7} x2={0} y2={0.8} strokeWidth={0.08} />
        </g>
      );
    case 'OTHER':
      return (
        <g>
          <rect
            x={-0.75}
            y={-0.75}
            width={1.5}
            height={1.5}
            rx={0.2}
            fill="#9ca3af"
            stroke="#374151"
            strokeWidth={0.06}
          />
          <text
            x={0}
            y={0.35}
            textAnchor="middle"
            fontSize={1}
            fontWeight={700}
            fill="#111827"
            fontFamily="system-ui, sans-serif"
          >
            ?
          </text>
        </g>
      );
  }
}

/** Impact star, drawn at unit size; scale it to the screen. */
export function ImpactGlyph() {
  const pts: string[] = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 === 0 ? 1 : 0.5;
    pts.push(`${(Math.cos(a) * rr).toFixed(3)},${(Math.sin(a) * rr).toFixed(3)}`);
  }
  return <polygon points={pts.join(' ')} fill="#dc2626" stroke="#ffffff" strokeWidth={0.12} strokeLinejoin="round" />;
}

const ICON_EXTENT: Record<ObjectKind, number> = {
  WALL: 3,
  FENCE: 3,
  BARRIER: 3.6,
  LAMP_POST: 2.1,
  BOLLARD: 0.4,
  SIGN: 0.65,
  TREE: 2.5,
  ANIMAL: 1.05,
  OTHER: 0.95,
};

/** Small self-contained preview used on palette buttons and the drag ghost. */
export function PaletteIcon({ entry, size = 36 }: { entry: PaletteEntry; size?: number }) {
  if (entry.type === 'impact') {
    return (
      <svg width={size} height={size} viewBox="-1.2 -1.2 2.4 2.4" aria-hidden="true">
        <ImpactGlyph />
      </svg>
    );
  }
  const extent = entry.type === 'vehicle' ? VEHICLE_SPECS[entry.kind].length * 0.62 : ICON_EXTENT[entry.kind];
  const rotate = entry.type === 'vehicle' ? 'rotate(90)' : undefined;
  return (
    <svg width={size} height={size} viewBox={`${-extent} ${-extent} ${extent * 2} ${extent * 2}`} aria-hidden="true">
      <g transform={rotate}>
        {entry.type === 'vehicle' ? (
          <VehicleGlyph kind={entry.kind} colour={entry.role === 'POLICYHOLDER' ? '#1d4ed8' : '#c2410c'} />
        ) : (
          <ObjectGlyph kind={entry.kind} length={OBJECT_SPECS[entry.kind].length} />
        )}
      </g>
    </svg>
  );
}

export type PaletteEntry =
  | { type: 'vehicle'; kind: VehicleKind; role: 'POLICYHOLDER' | 'THIRD_PARTY'; label: string }
  | { type: 'object'; kind: ObjectKind; label: string }
  | { type: 'impact'; label: string };

/* ------------------------------------------------------------------ */
/* UI icons (24px grid, currentColor)                                  */
/* ------------------------------------------------------------------ */

const ICONS = {
  cursor: 'M5 3l14 8-6 1.5L10 19z',
  arrow: 'M4 20L20 4M20 4h-8M20 4v8',
  undo: 'M9 14L4 9l5-5M4 9h10.5a5.5 5.5 0 010 11H11',
  redo: 'M15 14l5-5-5-5M20 9H9.5a5.5 5.5 0 000 11H13',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  target: 'M12 2v4M12 18v4M2 12h4M18 12h4M12 8a4 4 0 100 8 4 4 0 000-8z',
  rotateCw: 'M20 11a8 8 0 10-2.3 5.7M20 4v7h-7',
  rotateCcw: 'M4 11a8 8 0 112.3 5.7M4 4v7h7',
  trash: 'M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3',
  search: 'M11 4a7 7 0 100 14 7 7 0 000-14zM20 20l-4-4',
  pin: 'M12 21s-7-6.5-7-12a7 7 0 0114 0c0 5.5-7 12-7 12zM12 7a2 2 0 100 4 2 2 0 000-4z',
  gps: 'M12 2v3M12 19v3M2 12h3M19 12h3M12 6a6 6 0 100 12 6 6 0 000-12zM12 10a2 2 0 100 4 2 2 0 000-4z',
  map: 'M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14',
  satellite:
    'M12 3a9 9 0 100 18 9 9 0 000-18zM3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9M12 3c-2.5 2.7-3.8 5.7-3.8 9s1.3 6.3 3.8 9',
  road: 'M8 3L4 21M16 3l4 18M12 4v3M12 10v3M12 16v4',
  swap: 'M7 7h13l-4-4M17 17H4l4 4',
  check: 'M5 12l5 5L20 7',
  straighten: 'M4 12h16',
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={ICONS[name]} />
    </svg>
  );
}
