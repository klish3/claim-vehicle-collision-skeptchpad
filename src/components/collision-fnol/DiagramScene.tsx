import { useMemo, type PointerEvent as ReactPointerEvent, type Ref, type SVGProps } from 'react';
import {
  OBJECT_SPECS,
  UNLINKED_ARROW_COLOUR,
  VEHICLE_SPECS,
  footprint,
  isArrow,
  isImpact,
  isObject,
  isVehicle,
  quadPoint,
  vehicleColour,
  type ArrowItem,
  type Diagram,
  type DiagramItem,
  type PlacedItem,
  type View,
} from './diagram';
import { visibleTiles, type MapLayer } from './geo';
import { ImpactGlyph, ObjectGlyph, VehicleGlyph } from './glyphs';
import { SchematicBackdrop } from './schematics';
import { vehicleLabel } from './payload';
import type { LatLng } from './types';

export type HandlePart = 'body' | 'rotate' | 'from' | 'to' | 'mid';

export interface DiagramSceneProps {
  width: number;
  height: number;
  diagram: Diagram;
  view: View;
  origin: LatLng | null;
  /** Tile layer for the map backdrop. Null (none configured or none working) draws the road sketch instead. */
  layer: MapLayer | null;
  /** Map tiles are still being checked: draw a neutral background rather than flashing the road sketch. */
  mapLoading?: boolean;
  title: string;
  selectedId?: string | null;
  /** Omit for a static, non-interactive render (review / snapshot). */
  onItemPointerDown?: (e: ReactPointerEvent<SVGElement>, id: string, part: HandlePart) => void;
  onItemFocus?: (id: string) => void;
  svgRef?: Ref<SVGSVGElement>;
  worldRef?: Ref<SVGGElement>;
  svgProps?: Omit<SVGProps<SVGSVGElement>, 'ref'>;
}

const ACCENT = '#0b5cad';
const FONT = 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif';

export function DiagramScene(props: DiagramSceneProps) {
  const { width, height, diagram, view, origin, layer, mapLoading, selectedId, onItemPointerDown, onItemFocus } = props;
  const { svgRef, worldRef, svgProps, title } = props;
  const S = view.scale;
  const px = (n: number) => n / S;
  const onMap = diagram.backdrop === 'MAP' && !!origin && !!layer;
  const interactive = !!onItemPointerDown;

  const tiles = useMemo(
    () =>
      onMap && origin && layer
        ? visibleTiles({
            origin,
            center: view.center,
            scale: S,
            width,
            height,
            tileUrl: layer.url,
            maxZoom: layer.maxZoom,
          })
        : [],
    [onMap, origin, view.center, S, width, height, layer],
  );

  const vehicles = diagram.items.filter(isVehicle);
  const byId = new Map(vehicles.map((v) => [v.id, v]));
  const selected = diagram.items.find((i) => i.id === selectedId);

  const handlers = (item: DiagramItem, label: string) =>
    interactive
      ? {
          tabIndex: 0,
          role: 'button',
          'aria-label': label,
          'aria-pressed': item.id === selectedId,
          onPointerDown: (e: ReactPointerEvent<SVGElement>) => onItemPointerDown?.(e, item.id, 'body'),
          onFocus: () => onItemFocus?.(item.id),
          style: { cursor: 'grab', outline: 'none' },
        }
      : {};

  const handle = (part: HandlePart, id: string) =>
    interactive
      ? {
          onPointerDown: (e: ReactPointerEvent<SVGElement>) => onItemPointerDown?.(e, id, part),
          style: { cursor: part === 'rotate' ? 'alias' : 'move' },
        }
      : {};

  return (
    <svg
      ref={svgRef}
      xmlns="http://www.w3.org/2000/svg"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fontFamily={FONT}
      {...svgProps}
    >
      <title>{title}</title>
      <g
        ref={worldRef}
        transform={`translate(${width / 2} ${height / 2}) scale(${S}) translate(${-view.center.x} ${-view.center.y})`}
      >
        {onMap ? (
          <g>
            <rect
              x={view.center.x - width / S}
              y={view.center.y - height / S}
              width={(width * 2) / S}
              height={(height * 2) / S}
              fill="#e8e4dc"
            />
            {tiles.map((t) => (
              <image
                key={t.key}
                href={t.url}
                x={t.x}
                y={t.y}
                width={t.size + px(0.75)}
                height={t.size + px(0.75)}
                preserveAspectRatio="none"
              />
            ))}
            <rect
              x={view.center.x - width / S}
              y={view.center.y - height / S}
              width={(width * 2) / S}
              height={(height * 2) / S}
              fill="#ffffff"
              opacity={layer?.kind === 'satellite' ? 0.06 : 0.12}
            />
          </g>
        ) : diagram.backdrop === 'MAP' && mapLoading ? (
          <rect
            x={view.center.x - width / S}
            y={view.center.y - height / S}
            width={(width * 2) / S}
            height={(height * 2) / S}
            fill="#eceae6"
          />
        ) : (
          <SchematicBackdrop layout={diagram.layout} rotation={diagram.layoutRotation} />
        )}

        {diagram.items.filter(isObject).map((o) => {
          const { hx, hy } = footprint(o);
          return (
            <g
              key={o.id}
              transform={`translate(${o.x} ${o.y}) rotate(${o.heading})`}
              {...handlers(o, `${OBJECT_SPECS[o.kind].label}`)}
            >
              <rect
                x={-Math.max(hx, px(16))}
                y={-Math.max(hy, px(16))}
                width={Math.max(hx, px(16)) * 2}
                height={Math.max(hy, px(16)) * 2}
                fill="transparent"
              />
              <ObjectGlyph kind={o.kind} length={o.length} />
            </g>
          );
        })}

        {diagram.items.filter(isArrow).map((a, i) => (
          <ArrowShape
            key={a.id}
            arrow={a}
            seq={i + 1}
            colour={
              a.vehicleId && byId.get(a.vehicleId)
                ? vehicleColour(byId.get(a.vehicleId)!.letter)
                : UNLINKED_ARROW_COLOUR
            }
            px={px}
            groupProps={handlers(
              a,
              `Movement ${i + 1}${a.vehicleId && byId.get(a.vehicleId) ? ` for vehicle ${byId.get(a.vehicleId)!.letter}` : ''}`,
            )}
          />
        ))}

        {vehicles.map((v) => {
          const { hx, hy } = footprint(v);
          return (
            <g key={v.id} transform={`translate(${v.x} ${v.y}) rotate(${v.heading})`} {...handlers(v, vehicleLabel(v))}>
              <rect
                x={-Math.max(hx, px(16))}
                y={-Math.max(hy, px(16))}
                width={Math.max(hx, px(16)) * 2}
                height={Math.max(hy, px(16)) * 2}
                fill="transparent"
              />
              <VehicleGlyph kind={v.kind} colour={vehicleColour(v.letter)} />
            </g>
          );
        })}

        {diagram.items.filter(isImpact).map((x) => (
          <g key={x.id} transform={`translate(${x.x} ${x.y})`} {...handlers(x, 'Impact point')}>
            <circle r={px(20)} fill="transparent" />
            <g transform={`scale(${px(15)})`}>
              <ImpactGlyph />
            </g>
          </g>
        ))}

        {/* Letter badges sit above every vehicle so they are always readable. */}
        {vehicles.map((v) => {
          const small = VEHICLE_SPECS[v.kind].length < 3;
          const bx = v.x + (small ? footprint(v).hy + px(12) : 0);
          const colour = vehicleColour(v.letter);
          return (
            <g
              key={`b${v.id}`}
              transform={`translate(${bx} ${v.y})`}
              pointerEvents={interactive ? undefined : 'none'}
              {...(interactive ? handle('body', v.id) : {})}
            >
              <circle r={px(11)} fill={colour} stroke="#ffffff" strokeWidth={px(2)} />
              <text y={px(4.5)} textAnchor="middle" fontSize={px(13)} fontWeight={700} fill="#ffffff">
                {v.letter}
              </text>
              {v.motion !== 'MOVING' && (
                <text
                  y={px(26)}
                  textAnchor="middle"
                  fontSize={px(10)}
                  fontWeight={700}
                  fill="#111827"
                  stroke="#ffffff"
                  strokeWidth={px(3)}
                  paintOrder="stroke"
                >
                  {v.motion === 'PARKED' ? 'Parked' : 'Stopped'}
                </text>
              )}
            </g>
          );
        })}

        {selected && interactive && <SelectionHandles item={selected} px={px} handle={handle} />}
      </g>

      {diagram.backdrop === 'MAP' && mapLoading && !onMap && (
        <text x={width / 2} y={height / 2} textAnchor="middle" fontSize={14} fill="#5b6470" pointerEvents="none">
          Loading map…
        </text>
      )}
      <ScaleBar scale={S} height={height} />
      {onMap && <NorthArrow width={width} />}
      {onMap && layer && <Attribution text={layer.attribution} width={width} height={height} />}
    </svg>
  );
}

function ArrowShape({
  arrow,
  seq,
  colour,
  px,
  groupProps,
}: {
  arrow: ArrowItem;
  seq: number;
  colour: string;
  px: (n: number) => number;
  groupProps: object;
}) {
  const { from, to, ctrl } = arrow;
  let tx = to.x - ctrl.x;
  let ty = to.y - ctrl.y;
  if (Math.hypot(tx, ty) < 0.05) {
    tx = to.x - from.x;
    ty = to.y - from.y;
  }
  const len = Math.hypot(tx, ty) || 1;
  const ux = tx / len;
  const uy = ty / len;
  const head = px(16);
  const hw = px(8);
  const bx = to.x - ux * head * 0.8;
  const by = to.y - uy * head * 0.8;
  const d = `M ${from.x} ${from.y} Q ${ctrl.x} ${ctrl.y} ${bx} ${by}`;
  const baseX = to.x - ux * head;
  const baseY = to.y - uy * head;
  const headPts = `${to.x},${to.y} ${baseX - uy * hw},${baseY + ux * hw} ${baseX + uy * hw},${baseY - ux * hw}`;
  const badge = quadPoint(arrow, 0.3);

  return (
    <g {...groupProps}>
      <path d={d} fill="none" stroke="transparent" strokeWidth={px(22)} strokeLinecap="round" />
      <path d={d} fill="none" stroke="#ffffff" strokeOpacity={0.9} strokeWidth={px(8)} strokeLinecap="round" />
      <path d={d} fill="none" stroke={colour} strokeWidth={px(4.5)} strokeLinecap="round" />
      <polygon points={headPts} fill={colour} stroke="#ffffff" strokeWidth={px(1.5)} strokeLinejoin="round" />
      <g transform={`translate(${badge.x} ${badge.y})`}>
        <circle r={px(9)} fill="#ffffff" stroke={colour} strokeWidth={px(2)} />
        <text y={px(4)} textAnchor="middle" fontSize={px(11)} fontWeight={700} fill={colour}>
          {seq}
        </text>
      </g>
    </g>
  );
}

function SelectionHandles({
  item,
  px,
  handle,
}: {
  item: DiagramItem;
  px: (n: number) => number;
  handle: (part: HandlePart, id: string) => object;
}) {
  const knob = (x: number, y: number, part: HandlePart, shape: 'circle' | 'diamond' = 'circle') => (
    <g key={part} transform={`translate(${x} ${y})`} {...handle(part, item.id)} data-handle={part}>
      <circle r={px(20)} fill="transparent" />
      {shape === 'circle' ? (
        <circle r={px(8)} fill="#ffffff" stroke={ACCENT} strokeWidth={px(2.5)} />
      ) : (
        <rect
          x={-px(7)}
          y={-px(7)}
          width={px(14)}
          height={px(14)}
          transform="rotate(45)"
          fill={ACCENT}
          stroke="#ffffff"
          strokeWidth={px(2)}
        />
      )}
    </g>
  );

  if (item.type === 'arrow') {
    const mid = quadPoint(item, 0.5);
    return (
      <g>
        {knob(item.from.x, item.from.y, 'from')}
        {knob(mid.x, mid.y, 'mid', 'diamond')}
        {knob(item.to.x, item.to.y, 'to')}
      </g>
    );
  }

  if (item.type === 'impact') {
    return (
      <circle
        cx={item.x}
        cy={item.y}
        r={px(22)}
        fill="none"
        stroke={ACCENT}
        strokeWidth={px(2)}
        strokeDasharray={`${px(5)} ${px(4)}`}
        pointerEvents="none"
      />
    );
  }

  const { hx, hy } = footprint(item as PlacedItem);
  const pad = px(5);
  const stem = hy + pad + px(26);
  return (
    <g transform={`translate(${item.x} ${item.y}) rotate(${item.heading})`}>
      <rect
        x={-hx - pad}
        y={-hy - pad}
        width={(hx + pad) * 2}
        height={(hy + pad) * 2}
        fill="none"
        stroke={ACCENT}
        strokeWidth={px(2)}
        strokeDasharray={`${px(6)} ${px(4)}`}
        pointerEvents="none"
      />
      <line x1={0} y1={-hy - pad} x2={0} y2={-stem} stroke={ACCENT} strokeWidth={px(2)} pointerEvents="none" />
      {knob(0, -stem, 'rotate')}
    </g>
  );
}

function ScaleBar({ scale, height }: { scale: number; height: number }) {
  const options = [1, 2, 5, 10, 20, 25, 50, 100, 200];
  const metres = [...options].reverse().find((m) => m * scale <= 120) ?? 1;
  const w = metres * scale;
  const x = 14;
  const y = height - 16;
  return (
    <g pointerEvents="none">
      <rect x={x - 6} y={y - 20} width={w + 12} height={28} rx={4} fill="#ffffff" opacity={0.85} />
      <path d={`M ${x} ${y - 5} V ${y} H ${x + w} V ${y - 5}`} fill="none" stroke="#111827" strokeWidth={2} />
      <text x={x + w / 2} y={y - 8} textAnchor="middle" fontSize={11} fill="#111827">
        {metres} m
      </text>
    </g>
  );
}

/** Provider credit, bottom-right. " | " starts a new line so long credits fit on phones. */
function Attribution({ text, width, height }: { text: string; width: number; height: number }) {
  const lines = text.split(' | ');
  const lineH = 12;
  const boxW = Math.min(width - 150, Math.max(...lines.map((l) => l.length)) * 5.2 + 10);
  const boxH = lines.length * lineH + 4;
  return (
    <g pointerEvents="none">
      <rect x={width - boxW} y={height - boxH} width={boxW} height={boxH} fill="#ffffff" opacity={0.85} />
      {lines.map((line, i) => (
        <text
          key={line}
          x={width - 5}
          y={height - boxH + lineH * (i + 1) - 1}
          textAnchor="end"
          fontSize={9.5}
          fill="#374151"
        >
          {line}
        </text>
      ))}
    </g>
  );
}

function NorthArrow({ width }: { width: number }) {
  return (
    <g transform={`translate(${width - 26} 28)`} pointerEvents="none">
      <circle r={16} fill="#ffffff" opacity={0.9} stroke="#9ca3af" />
      <path d="M 0 -11 L 5 3 L 0 0 L -5 3 Z" fill="#111827" />
      <text y={13} textAnchor="middle" fontSize={9} fontWeight={700} fill="#111827">
        N
      </text>
    </g>
  );
}
