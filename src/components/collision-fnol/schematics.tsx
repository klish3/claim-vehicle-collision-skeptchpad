import type { ReactNode } from 'react';
import type { SchematicLayout } from './types';

/*
 * Schematic road layouts in METRES centred on (0,0). UK conventions:
 * 7.3 m single carriageway, 2 m footways, traffic keeps left, roundabouts
 * circulate clockwise. Presentation attributes only (serialisable).
 */

const E = 260; // how far roads extend, so panning never runs off the edge
const HW = 3.65; // half carriageway
const FOOT = 2;
const C = {
  ground: '#e7ebe0',
  grass: '#cddcb6',
  footway: '#d5d2cb',
  road: '#62666c',
  marking: '#ffffff',
  kerb: '#a8a29e',
};

const markingProps = { stroke: C.marking, strokeWidth: 0.15, fill: 'none' } as const;

/** Filled corner between two perpendicular roads. Corner at (a,a), arc centre at (c,c). */
function Fillet({ a, c, fill, sx, sy }: { a: number; c: number; fill: string; sx: 1 | -1; sy: 1 | -1 }) {
  const r = c - a;
  return (
    <path transform={`scale(${sx} ${sy})`} d={`M ${a} ${a} L ${c} ${a} A ${r} ${r} 0 0 0 ${a} ${c} Z`} fill={fill} />
  );
}

/** Road markings for one arm pointing north (up); rotate the group for other arms. */
function ArmMarkings({ start, giveWay }: { start: number; giveWay?: boolean }) {
  return (
    <g>
      <line x1={0} x2={0} y1={-start - 2} y2={-E} {...markingProps} strokeDasharray="4 5" />
      {giveWay && (
        // Traffic approaching southbound keeps left, i.e. the east half of the arm.
        <g {...markingProps} strokeWidth={0.2} strokeDasharray="0.6 0.3">
          <line x1={0.15} x2={HW - 0.15} y1={-start - 0.3} y2={-start - 0.3} />
          <line x1={0.15} x2={HW - 0.15} y1={-start - 0.9} y2={-start - 0.9} />
        </g>
      )}
    </g>
  );
}

/** Painted direction arrow, pointing up at heading 0. */
function Chevron({ x, y, heading, size = 1.4 }: { x: number; y: number; heading: number; size?: number }) {
  const s = size;
  return (
    <g transform={`translate(${x} ${y}) rotate(${heading})`}>
      <line x1={0} y1={s} x2={0} y2={-s * 0.2} stroke={C.marking} strokeWidth={0.28} strokeLinecap="round" />
      <path d={`M 0 ${-s} L ${s * 0.45} ${-s * 0.15} L ${-s * 0.45} ${-s * 0.15} Z`} fill={C.marking} />
    </g>
  );
}

const QUADS: Array<[1 | -1, 1 | -1]> = [
  [1, 1],
  [-1, 1],
  [1, -1],
  [-1, -1],
];

function Crossroads() {
  const R = 6;
  return (
    <g>
      <rect x={-E} y={-(HW + FOOT)} width={E * 2} height={(HW + FOOT) * 2} fill={C.footway} />
      <rect x={-(HW + FOOT)} y={-E} width={(HW + FOOT) * 2} height={E * 2} fill={C.footway} />
      {QUADS.map(([sx, sy]) => (
        <Fillet key={`f${sx}${sy}`} a={HW + FOOT} c={HW + R} fill={C.footway} sx={sx} sy={sy} />
      ))}
      <rect x={-E} y={-HW} width={E * 2} height={HW * 2} fill={C.road} />
      <rect x={-HW} y={-E} width={HW * 2} height={E * 2} fill={C.road} />
      {QUADS.map(([sx, sy]) => (
        <Fillet key={`r${sx}${sy}`} a={HW} c={HW + R} fill={C.road} sx={sx} sy={sy} />
      ))}
      {/* Main road east–west, minor road north–south with give-way lines. */}
      <g transform="rotate(0)">
        <ArmMarkings start={HW} giveWay />
      </g>
      <g transform="rotate(180)">
        <ArmMarkings start={HW} giveWay />
      </g>
      <g transform="rotate(90)">
        <ArmMarkings start={HW + R} />
      </g>
      <g transform="rotate(270)">
        <ArmMarkings start={HW + R} />
      </g>
    </g>
  );
}

function TJunction() {
  const R = 6;
  return (
    <g>
      <rect x={-E} y={-(HW + FOOT)} width={E * 2} height={(HW + FOOT) * 2} fill={C.footway} />
      <rect x={-(HW + FOOT)} y={0} width={(HW + FOOT) * 2} height={E} fill={C.footway} />
      <Fillet a={HW + FOOT} c={HW + R} fill={C.footway} sx={1} sy={1} />
      <Fillet a={HW + FOOT} c={HW + R} fill={C.footway} sx={-1} sy={1} />
      <rect x={-E} y={-HW} width={E * 2} height={HW * 2} fill={C.road} />
      <rect x={-HW} y={0} width={HW * 2} height={E} fill={C.road} />
      <Fillet a={HW} c={HW + R} fill={C.road} sx={1} sy={1} />
      <Fillet a={HW} c={HW + R} fill={C.road} sx={-1} sy={1} />
      <line x1={-E} x2={E} y1={0} y2={0} {...markingProps} strokeDasharray="4 5" />
      <g transform="rotate(180)">
        <ArmMarkings start={HW} giveWay />
      </g>
    </g>
  );
}

function Roundabout() {
  const Ro = 15;
  const Ri = 6;
  const mid = (Ro + Ri) / 2;
  return (
    <g>
      <circle r={Ro + FOOT} fill={C.footway} />
      <rect x={-E} y={-(HW + FOOT)} width={E * 2} height={(HW + FOOT) * 2} fill={C.footway} />
      <rect x={-(HW + FOOT)} y={-E} width={(HW + FOOT) * 2} height={E * 2} fill={C.footway} />
      <rect x={-E} y={-HW} width={E * 2} height={HW * 2} fill={C.road} />
      <rect x={-HW} y={-E} width={HW * 2} height={E * 2} fill={C.road} />
      <circle r={Ro} fill={C.road} />
      <circle r={Ri + 1} fill="#7b8087" />
      <circle r={Ri} fill={C.grass} stroke={C.kerb} strokeWidth={0.25} />
      {[0, 90, 180, 270].map((rot) => (
        <g key={rot} transform={`rotate(${rot})`}>
          <ArmMarkings start={Ro} giveWay />
        </g>
      ))}
      {/* UK roundabouts circulate clockwise. */}
      {[45, 135, 225, 315].map((a) => {
        const t = (a * Math.PI) / 180;
        return <Chevron key={a} x={Math.cos(t) * mid} y={Math.sin(t) * mid} heading={a + 180} />;
      })}
    </g>
  );
}

function StraightRoad() {
  return (
    <g>
      <rect x={-E} y={-(HW + FOOT)} width={E * 2} height={(HW + FOOT) * 2} fill={C.footway} />
      <rect x={-E} y={-HW} width={E * 2} height={HW * 2} fill={C.road} />
      <line x1={-E} x2={E} y1={0} y2={0} {...markingProps} strokeDasharray="4 5" />
    </g>
  );
}

function DualCarriageway() {
  const res = 1.5; // half central reservation
  const cw = HW * 2; // carriageway width
  return (
    <g>
      <rect x={-E} y={-(res + cw + 3)} width={E * 2} height={(res + cw + 3) * 2} fill={C.grass} />
      <rect x={-E} y={-(res + cw)} width={E * 2} height={cw} fill={C.road} />
      <rect x={-E} y={res} width={E * 2} height={cw} fill={C.road} />
      <rect x={-E} y={-res} width={E * 2} height={res * 2} fill={C.grass} />
      <line x1={-E} x2={E} y1={0} y2={0} stroke="#9ca3af" strokeWidth={0.3} />
      {[-(res + cw / 2), res + cw / 2].map((y) => (
        <line key={y} x1={-E} x2={E} y1={y} y2={y} {...markingProps} strokeDasharray="3 6" />
      ))}
      {[-(res + cw - 0.3), -(res + 0.3), res + 0.3, res + cw - 0.3].map((y) => (
        <line key={y} x1={-E} x2={E} y1={y} y2={y} {...markingProps} />
      ))}
      {/* Keep left: north carriageway runs east, south carriageway runs west. */}
      {[-40, 0, 40].map((x) => (
        <g key={x}>
          <Chevron x={x} y={-(res + cw * 0.75)} heading={90} />
          <Chevron x={x} y={-(res + cw * 0.25)} heading={90} />
          <Chevron x={x + 20} y={res + cw * 0.25} heading={270} />
          <Chevron x={x + 20} y={res + cw * 0.75} heading={270} />
        </g>
      ))}
    </g>
  );
}

function CarPark() {
  const bay = 2.5;
  const depth = 5;
  const halfWidth = 35;
  const rows: ReactNode[] = [];
  // Back-to-back bay blocks either side of a central aisle.
  for (const [top, bottom] of [
    [-3.5 - depth * 2, -3.5],
    [3.5, 3.5 + depth * 2],
  ] as const) {
    rows.push(
      <line
        key={`m${top}`}
        x1={-halfWidth}
        x2={halfWidth}
        y1={(top + bottom) / 2}
        y2={(top + bottom) / 2}
        {...markingProps}
      />,
    );
    for (let x = -halfWidth; x <= halfWidth + 0.01; x += bay) {
      rows.push(<line key={`${top}:${x}`} x1={x} x2={x} y1={top} y2={bottom} {...markingProps} />);
    }
  }
  return (
    <g>
      <rect
        x={-halfWidth - 8}
        y={-28}
        width={(halfWidth + 8) * 2}
        height={56}
        fill="#6b7075"
        stroke={C.kerb}
        strokeWidth={0.4}
      />
      {rows}
      {[-20, 0, 20].map((x) => (
        <g key={x}>
          <Chevron x={x} y={0} heading={90} />
          <Chevron x={x} y={-17} heading={270} />
          <Chevron x={x} y={17} heading={270} />
        </g>
      ))}
    </g>
  );
}

function Blank() {
  const lines: ReactNode[] = [];
  for (let v = -100; v <= 100; v += 5) {
    const strong = v % 25 === 0;
    const props = { stroke: '#cbd2d9', strokeWidth: strong ? 0.12 : 0.05 };
    lines.push(<line key={`x${v}`} x1={v} x2={v} y1={-100} y2={100} {...props} />);
    lines.push(<line key={`y${v}`} x1={-100} x2={100} y1={v} y2={v} {...props} />);
  }
  return <g>{lines}</g>;
}

export function SchematicBackdrop({ layout, rotation }: { layout: SchematicLayout; rotation: number }) {
  const ground = layout === 'BLANK' ? '#f3f5f7' : C.ground;
  return (
    <g>
      <rect x={-E * 2} y={-E * 2} width={E * 4} height={E * 4} fill={ground} />
      <g transform={`rotate(${rotation})`}>
        {layout === 'CROSSROADS' && <Crossroads />}
        {layout === 'T_JUNCTION' && <TJunction />}
        {layout === 'ROUNDABOUT' && <Roundabout />}
        {layout === 'STRAIGHT_ROAD' && <StraightRoad />}
        {layout === 'DUAL_CARRIAGEWAY' && <DualCarriageway />}
        {layout === 'CAR_PARK' && <CarPark />}
        {layout === 'BLANK' && <Blank />}
      </g>
    </g>
  );
}
