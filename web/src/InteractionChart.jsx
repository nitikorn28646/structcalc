// WSD P–M interaction diagram for bending about each axis (Apache ECharts, SVG renderer).
// Envelope: P ≤ Pa up to e = ea, then the linear fa/Fa + fb/Fb = 1 line down to the balanced point (Mb, Pb),
// then the tension-controlled line to Mo at P = 0.
import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import { LineChart, ScatterChart } from "echarts/charts";
import { GridComponent, LegendComponent, TooltipComponent } from "echarts/components";
import { SVGRenderer } from "echarts/renderers";

echarts.use([LineChart, ScatterChart, GridComponent, LegendComponent, TooltipComponent, SVGRenderer]);

const FONT = "Sarabun, Leelawadee UI, sans-serif";
const n0 = (v) => Math.round(v).toLocaleString("en-US");

// Spiral columns (r.Mpd defined) have one envelope for the resultant moment Mp.
export function envelopes(r) {
  const t = (v) => v / 1000; // kg → t, kg-m → t-m
  const curve = (Pa, Ma, Pb, Mb, Mo) => [[0, t(Pa)], [t(Ma), t(Pa)], [t(Mb), t(Pb)], [t(Mo), 0]];
  if (r.Mpd !== undefined) return { p: curve(r.Pa, r.Ma / 100, r.Pb, r.Mb / 100, r.Mo / 100) };
  return {
    x: curve(r.Pa, r.Max / 100, r.Pbx, r.Mbx / 100, r.Mox / 100),
    y: curve(r.Pa, r.May / 100, r.Pby, r.Mby / 100, r.Moy / 100),
  };
}

export default function InteractionChart({ r, width, height = 330, dark = false, animate = true }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = dark
      ? { axis: "#6e7591", label: "#9097b1", split: "#2c3250", X: "#7b8cff", Y: "#4ade80", pt: "#fbbf24", text: "#cdd1e2" }
      : { axis: "#475467", label: "#667085", split: "#eaecf0", X: "#465fff", Y: "#12b76a", pt: "#f04438", text: "#344054" };
    const env = envelopes(r);
    const chart = echarts.init(ref.current, null, { renderer: "svg", width, height });
    const area = (color) => ({ color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: `${color}40` }, { offset: 1, color: `${color}05` }]) });
    chart.setOption({
      animation: animate,
      textStyle: { fontFamily: FONT },
      legend: { top: 0, right: 8, textStyle: { color: c.text, fontFamily: FONT, fontSize: 11 }, itemWidth: 14 },
      tooltip: { trigger: "item", formatter: (p) => `${p.seriesName}<br/>M = ${p.value[0].toFixed(2)} t-m<br/>P = ${p.value[1].toFixed(2)} t` },
      grid: { left: 58, right: 20, top: 34, bottom: 40 },
      xAxis: { type: "value", name: "M (t-m)", nameLocation: "middle", nameGap: 24, min: 0,
        axisLine: { lineStyle: { color: c.axis } }, axisLabel: { color: c.label }, splitLine: { lineStyle: { color: c.split } } },
      yAxis: { type: "value", name: "P (t)", nameLocation: "middle", nameGap: 40, min: 0,
        axisLine: { lineStyle: { color: c.axis } }, axisLabel: { color: c.label }, splitLine: { lineStyle: { color: c.split } } },
      series: env.p ? [
        { name: "ขีดจำกัด (Mp)", type: "line", data: env.p, symbolSize: 6, lineStyle: { color: c.X, width: 2.2 }, itemStyle: { color: c.X }, areaStyle: area(c.X) },
        { name: "แรงออกแบบ", type: "scatter", symbol: "diamond", symbolSize: 13, itemStyle: { color: c.pt },
          data: [[r.Mpd / 1000, r.Pd / 1000]], label: { show: true, position: "right", color: c.text, fontSize: 11, formatter: "Mp" } },
      ] : [
        { name: "ขีดจำกัด แกน x", type: "line", data: env.x, symbolSize: 6, lineStyle: { color: c.X, width: 2.2 }, itemStyle: { color: c.X }, areaStyle: area(c.X) },
        { name: "ขีดจำกัด แกน y", type: "line", data: env.y, symbolSize: 6, lineStyle: { color: c.Y, width: 2.2, type: "dashed" }, itemStyle: { color: c.Y } },
        { name: "แรงออกแบบ", type: "scatter", symbol: "diamond", symbolSize: 13, itemStyle: { color: c.pt },
          data: [[r.Mxd / 1000, r.Pd / 1000], [r.Myd / 1000, r.Pd / 1000]],
          label: { show: true, position: "right", color: c.text, fontSize: 11, formatter: (p) => (p.dataIndex ? "My" : "Mx") } },
      ],
    });
    const ro = width ? null : new ResizeObserver(() => chart.resize());
    ro?.observe(ref.current);
    return () => { ro?.disconnect(); chart.dispose(); };
  }, [r, width, height, dark, animate]);
  return <div ref={ref} style={{ width: width ?? "100%", height }} />;
}

export { n0 };
