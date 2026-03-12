import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Table2, Upload, Users, Camera } from "lucide-react";
import { motion } from "motion/react";
import { toPng } from "html-to-image";

type PlayerRow = {
  player: string;
  position: string;
  depth?: string;
  side?: string;
  status?: string;
};

const statusColor: Record<string, string> = {
  active: "text-white",
  ir: "text-red-400",
  "practice squad": "text-yellow-400",
  suspended: "text-orange-400",
  osa: "text-green-400",
  dp: "text-green-600",
};

function parseCSV(text: string): PlayerRow[] {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());

  return lines.slice(1).map((line) => {
    const cols = line.split(",");
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      obj[h] = cols[i]?.trim() ?? "";
    });
    return obj as PlayerRow;
  });
}

function ChalkName({ name, status }: { name: string; status?: string }) {
  const isNeed = name?.trim().toUpperCase() === "NEED";
  const key = (status || "").trim().toLowerCase();
  const statusClass = statusColor[key] || "text-white";
  const colorClass = isNeed ? "text-blue-300" : statusClass;

  return (
      <div
          className={[
            "chalk-text",
            "text-center font-semibold tracking-wide leading-tight",
            "whitespace-normal break-words",
            "max-w-[84px] sm:max-w-[110px] md:max-w-[130px]",
            "text-[11px] sm:text-sm md:text-lg xl:text-xl",
            colorClass,
          ].join(" ")}
      >
        {name}
      </div>
  );
}

function normalizeSide(s?: string) {
  return (s ?? "").trim().toUpperCase();
}

function normalizePos(s?: string) {
  return (s ?? "").trim().toUpperCase();
}

function depthNum(d?: string) {
  const n = Number((d ?? "").trim());
  return Number.isFinite(n) ? n : 999;
}

function FullDepthChartWindow({ rows }: { rows: PlayerRow[] }) {
  const grouped = useMemo(() => {
    const sideMap = new Map<string, Map<string, PlayerRow[]>>();

    for (const r of rows) {
      const side = normalizeSide(r.side) || "OTHER";
      const pos = normalizePos(r.position) || "UNK";

      if (!sideMap.has(side)) sideMap.set(side, new Map());
      const posMap = sideMap.get(side)!;

      if (!posMap.has(pos)) posMap.set(pos, []);
      posMap.get(pos)!.push(r);
    }

    const sideOrder = ["OFFENSE", "DEFENSE", "SPECIAL TEAMS", "OTHER"];
    const sides = Array.from(sideMap.entries()).sort(([a], [b]) => {
      const ai = sideOrder.indexOf(a);
      const bi = sideOrder.indexOf(b);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi) || a.localeCompare(b);
    });

    return sides.map(([side, posMap]) => {
      const positions = Array.from(posMap.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([pos, players]) => ({
            pos,
            players: [...players].sort((a, b) => depthNum(a.depth) - depthNum(b.depth)),
          }));

      return { side, positions };
    });
  }, [rows]);

  return (
      <Card className="rounded-2xl bg-neutral-900 border-neutral-800">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Table2 className="h-4 w-4" />
            Full Depth Chart
          </CardTitle>
        </CardHeader>

        <CardContent>
          {rows.length === 0 ? (
              <div className="text-sm text-gray-400">Load a sheet to view the full chart.</div>
          ) : (
              <div className="space-y-6">
                {grouped.map(({ side, positions }) => (
                    <div key={side}>
                      <div className="text-sm font-bold text-gray-200 mb-2">{side}</div>

                      <div className="overflow-x-auto rounded-xl border border-neutral-800">
                        <div className="min-w-[720px]">
                          <div className="grid grid-cols-12 bg-neutral-950/50 text-xs text-gray-300 font-mono">
                            <div className="col-span-2 p-2 border-b border-neutral-800">POS</div>
                            <div className="col-span-10 p-2 border-b border-neutral-800">DEPTH</div>
                          </div>

                          {positions.map(({ pos, players }) => (
                              <div key={pos} className="grid grid-cols-12 text-sm">
                                <div className="col-span-2 p-2 border-b border-neutral-800 text-gray-200 font-mono">
                                  {pos}
                                </div>

                                <div className="col-span-10 p-2 border-b border-neutral-800">
                                  <div className="flex flex-wrap gap-x-6 gap-y-1">
                                    {players.map((p, i) => (
                                        <div key={i} className="flex items-baseline gap-2">
                                          <div className="text-[10px] text-gray-500 font-mono w-4 text-right">
                                            {depthNum(p.depth) === 999 ? "" : p.depth}
                                          </div>
                                          <ChalkName name={p.player} status={p.status} />
                                        </div>
                                    ))}
                                  </div>
                                </div>
                              </div>
                          ))}
                        </div>
                      </div>
                    </div>
                ))}
              </div>
          )}
        </CardContent>
      </Card>
  );
}

function normalizeStatus(s?: string) {
  const v = (s ?? "").trim().toLowerCase();
  if (!v) return "active";
  if (v === "dp") return "active";
  if (v === "osa") return "active";
  return v;
}

function PositionStatusCounts({ rows }: { rows: PlayerRow[] }) {
  const { statuses, data } = useMemo(() => {
    const statusSet = new Set<string>();
    const posMap = new Map<string, Record<string, number>>();

    for (const r of rows) {
      const pos = (r.position || "UNK").trim().toUpperCase();
      const status = normalizeStatus(r.status);

      statusSet.add(status);

      if (!posMap.has(pos)) posMap.set(pos, {});
      const rec = posMap.get(pos)!;
      rec[status] = (rec[status] ?? 0) + 1;
    }

    const preferred = ["active", "ir", "practice squad", "suspended", "out"];
    const statuses = [
      ...preferred.filter((s) => statusSet.has(s)),
      ...Array.from(statusSet).filter((s) => !preferred.includes(s)).sort(),
    ];

    const data = Array.from(posMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([pos, counts]) => ({
          pos,
          counts,
          total: Object.values(counts).reduce((a, b) => a + b, 0),
        }));

    return { statuses, data };
  }, [rows]);

  if (rows.length === 0) return null;

  return (
      <Card className="rounded-2xl bg-neutral-900/80 border-neutral-800 backdrop-blur">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Table2 className="h-4 w-4" />
            Position Counts by Status
          </CardTitle>
        </CardHeader>

        <CardContent>
          <div className="overflow-x-auto rounded-xl border border-neutral-800">
            <div className="min-w-[760px]">
              <div
                  className="grid bg-neutral-950/50 text-xs text-gray-300 font-mono border-b border-neutral-800"
                  style={{ gridTemplateColumns: `140px repeat(${statuses.length}, 1fr) 70px` }}
              >
                <div className="p-2">POS</div>
                {statuses.map((s) => (
                    <div key={s} className="p-2 text-center">
                      {s.toUpperCase()}
                    </div>
                ))}
                <div className="p-2 text-center">TOTAL</div>
              </div>

              {data.map((row) => (
                  <div
                      key={row.pos}
                      className="grid text-sm border-b border-neutral-800"
                      style={{ gridTemplateColumns: `140px repeat(${statuses.length}, 1fr) 70px` }}
                  >
                    <div className="p-2 font-mono text-gray-200">{row.pos}</div>

                    {statuses.map((s) => {
                      const n = row.counts[s] ?? 0;
                      const color = statusColor[s] ?? "text-gray-200";
                      return (
                          <div key={s} className={`p-2 text-center ${n ? color : "text-gray-600"}`}>
                            {n || "—"}
                          </div>
                      );
                    })}

                    <div className="p-2 text-center text-gray-200 font-mono">{row.total}</div>
                  </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
  );
}

const DEFENSE_COORDS: Record<string, { x: number; y: number }> = {
  FS: { x: 30, y: 75 },
  SS: { x: 65, y: 75 },
  LCB: { x: 90, y: 55 },
  RCB: { x: 6, y: 55 },
  NICKLEBACK: { x: 15, y: 25 },
  "MIKE LB": { x: 59, y: 43 },
  "WILL LB": { x: 42, y: 43 },
  NT: { x: 50, y: 5 },
  "4I": { x: 63, y: 5 },
  "5T": { x: 34, y: 5 },
  EDGE: { x: 75, y: 5 },
};

const OFFENSE_COORDS: Record<string, { x: number; y: number }> = {
  XWR: { x: 6, y: 10 },
  SWR: { x: 15, y: 30 },
  ZWR: { x: 90, y: 13 },
  TE: { x: 80, y: 30 },
  RB: { x: 63, y: 50 },
  QB: { x: 50, y: 40 },
  LT: { x: 25, y: 10 },
  LG: { x: 37, y: 10 },
  C: { x: 50, y: 10 },
  RG: { x: 63, y: 10 },
  RT: { x: 75, y: 10 },
};

function FieldPositionGroupD({
                               position,
                               players,
                               reverseDepth = false,
                             }: {
  position: string;
  players: PlayerRow[];
  reverseDepth?: boolean;
}) {
  const coord = DEFENSE_COORDS[position.toUpperCase()];
  if (!coord) return null;

  const sorted = [...players].sort((a, b) =>
      reverseDepth
          ? Number(b.depth ?? 999) - Number(a.depth ?? 999)
          : Number(a.depth ?? 999) - Number(b.depth ?? 999)
  );

  return (
      <div
          className="absolute z-10 flex flex-col items-center"
          style={{
            left: `${coord.x}%`,
            bottom: `${coord.y}%`,
            transform: "translateX(-50%)",
          }}
      >
        <div className="flex flex-col items-center space-y-1">
          {sorted.map((p, i) => (
              <div key={i} className="min-h-[18px] flex items-end justify-center">
                <ChalkName name={p.player} status={p.status} />
              </div>
          ))}
        </div>

        <div className="chalk-text-strong text-gray-400 text-lg sm:text-xl md:text-2xl xl:text-3xl">
          {position}
        </div>
      </div>
  );
}

function FieldPositionGroupO({
                               position,
                               players,
                             }: {
  position: string;
  players: PlayerRow[];
}) {
  const coord = OFFENSE_COORDS[position.toUpperCase()];
  if (!coord) return null;

  const sorted = [...players].sort(
      (a, b) => Number(a.depth ?? 999) - Number(b.depth ?? 999)
  );

  const LABEL_OFFSET_PX = 28;

  return (
      <>
        <div
            className="absolute z-20 chalk-text-strong text-gray-400 text-lg sm:text-xl md:text-2xl xl:text-3xl"
            style={{
              left: `${coord.x}%`,
              top: `calc(${coord.y}% - ${LABEL_OFFSET_PX}px)`,
              transform: "translateX(-50%)",
            }}
        >
          {position}
        </div>

        <div
            className="absolute z-10"
            style={{
              left: `${coord.x}%`,
              top: `${coord.y}%`,
              transform: "translateX(-50%)",
            }}
        >
          <div className="flex flex-col items-center space-y-1">
            {sorted.map((p, i) => (
                <div key={i} className="min-h-[18px] flex items-start justify-center">
                  <ChalkName name={p.player} status={p.status} />
                </div>
            ))}
          </div>
        </div>
      </>
  );
}

function DepthChartField({
                           side,
                           sideRows,
                         }: {
  side: "OFFENSE" | "DEFENSE";
  sideRows: PlayerRow[];
}) {
  const posMap = new Map<string, PlayerRow[]>();

  sideRows.forEach((r) => {
    const pos = (r.position || "UNK").toUpperCase();
    if (!posMap.has(pos)) posMap.set(pos, []);
    posMap.get(pos)!.push(r);
  });

  const byPosition = Array.from(posMap.entries());

  return (
      <div className="w-full">
        <div className="overflow-x-auto rounded-2xl border border-white/10 bg-black/10 pb-3">
          <div className="mx-auto w-full min-w-[760px] max-w-6xl px-2 sm:px-4">
            <div className="relative w-full aspect-[16/9] chalk-surface overflow-hidden rounded-2xl">
              {side === "DEFENSE" ? (
                  <>
                    <div className="absolute left-0 right-0 top-[95%] border-t border-white/40 z-0" />
                    {byPosition.map(([pos, players]) => (
                        <FieldPositionGroupD key={pos} position={pos} players={players} reverseDepth />
                    ))}
                  </>
              ) : (
                  <>
                    <div className="absolute left-0 right-0 top-[5%] border-t border-white/40 z-0" />
                    {byPosition.map(([pos, players]) => (
                        <FieldPositionGroupO key={pos} position={pos} players={players} />
                    ))}
                  </>
              )}
            </div>
          </div>
        </div>
      </div>
  );
}

export default function NFLDepthChartSheetApp() {
  const [sheetUrl, setSheetUrl] = useState(
      "https://docs.google.com/spreadsheets/d/e/2PACX-1vRB-h8eZQSvrhI9eQ3qVQlzlhkA6a2bk-KUd1_HCoxdHesaGIxJju33s4Qm3BGa0_niOKeWO1cimbi3/pub?gid=0&single=true&output=csv"
  );
  const [rows, setRows] = useState<PlayerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const captureRef = useRef<HTMLDivElement | null>(null);

  const bySide = useMemo(() => {
    const map = new Map<string, PlayerRow[]>();

    for (const r of rows) {
      const side = (r.side || "OTHER").toUpperCase();
      if (!map.has(side)) map.set(side, []);
      map.get(side)!.push(r);
    }

    return Array.from(map.entries());
  }, [rows]);

  async function saveSnapshot() {
    if (!captureRef.current) return;

    try {
      await document.fonts.ready;

      const dataUrl = await toPng(captureRef.current, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: "#1f1f1f",
      });

      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `bills-depth-chart-${new Date().toISOString().slice(0, 10)}.png`;
      a.click();
    } catch (e) {
      console.error(e);
      setError("Snapshot failed. Try again after the page fully loads.");
    }
  }

  async function loadSheet(url = sheetUrl) {
    if (!url) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const text = await res.text();
      const parsed = parseCSV(text);
      setRows(parsed);
    } catch (e) {
      console.error(e);
      setError("Failed to load sheet. Make sure it is published as CSV.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSheet();
  }, []);

  return (
      <div ref={captureRef} className="space-y-10">
        <div className="min-h-screen zubaz-bg text-white px-3 py-4 sm:px-4 md:p-6">
          <div className="max-w-7xl mx-auto">
            <motion.div>
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <Users className="h-5 w-5" />
                <h1 className="text-xl sm:text-2xl md:text-3xl font-bold">Bills Depth Chart</h1>
              </div>

              <Card className="chalk-surface rounded-2xl bg-neutral-900 border-neutral-800">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Upload className="h-4 w-4" />
                    Google Sheet Input
                  </CardTitle>
                </CardHeader>

                <CardContent className="space-y-3">
                  <Input
                      placeholder="Paste published Google Sheet CSV URL..."
                      value={sheetUrl}
                      onChange={(e) => setSheetUrl(e.target.value)}
                      className="rounded-xl"
                  />

                  <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                    <Button onClick={() => loadSheet()} disabled={loading} className="w-full rounded-xl sm:w-auto">
                      {loading ? "Loading…" : "Reload Depth Chart"}
                    </Button>

                    <Button
                        variant="secondary"
                        onClick={saveSnapshot}
                        disabled={rows.length === 0}
                        className="w-full rounded-xl sm:w-auto"
                    >
                      <Camera className="h-4 w-4 mr-2" />
                      Save Snapshot
                    </Button>
                  </div>

                  {error && <div className="text-red-400 text-sm">{error}</div>}
                </CardContent>
              </Card>

              <Separator className="my-6 bg-neutral-800" />

              {rows.length === 0 ? (
                  <div className="chalk-surface text-center text-gray-400 py-16">
                    {loading ? "Loading Bills depth chart..." : "No depth chart loaded."}
                  </div>
              ) : (
                  <div className="space-y-8 overflow-y-auto">
                    {bySide.map(([side, sideRows]) => {
                      if (side !== "DEFENSE") return null;
                      return <DepthChartField key={side} side="DEFENSE" sideRows={sideRows} />;
                    })}

                    {bySide.map(([side, sideRows]) => {
                      if (side !== "OFFENSE") return null;
                      return <DepthChartField key={side} side="OFFENSE" sideRows={sideRows} />;
                    })}
                  </div>
              )}

              <div className="mt-6 text-xs text-gray-400 text-center">
                Tip: On phones, swipe sideways on the field if you need the full formation.
              </div>
            </motion.div>
          </div>

          <div className="mt-10">
            <FullDepthChartWindow rows={rows} />
          </div>

          <div className="mt-8">
            <PositionStatusCounts rows={rows} />
          </div>
        </div>
      </div>
  );
}
