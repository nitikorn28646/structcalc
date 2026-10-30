// Load on each pile versus the allowable pile load (Apache ECharts bar chart, SVG renderer).
import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import { BarChart } from "echarts/charts";
import { GridComponent, MarkLineComponent, TooltipComponent } from "echarts/components";
import { SVGRenderer } from "echarts/renderers";

echarts.use([BarChart, GridComponent, MarkLineComponent, TooltipComponent, SVGRenderer]);
const FONT = "Sarabun, Leelawadee UI, sans-serif";

// Individual pile loads: share of P and cap weight plus the moment couple at each pile position.
export function pileLoads(f, r) {
  const xs = r.piles.map((p) => p[0]), ys = r.piles.map((p) => p[1]);
  const sx2 = xs.reduce((a, x) => a + x * x, 0), sy2 = ys.reduce((a, y) => a + y * y, 0);
  const W = (f.Df - f.t) * r.Bx * r.By * f.gamma + f.t * r.Bx * r.By * 2400;
  return r.piles.map(([x, y]) => (f.P + W) / f.n + (sx2 ? (f.My * x) / sx2 : 0) + (sy2 ? (f.Mx * y) / sy2 : 0));
}

export default function PileChart({ f, r, width, height = 330, dark = false, animate = true }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = dark ? { axis: "#6e7591", label: "#9097b1", split: "#2c3250", bar: "#7b8cff", lim: "#f87171", text: "#cdd1e2" }
      : { axis: "#475467", label: "#667085", split: "#eaecf0", bar: "#465fff", lim: "#f04438", text: "#344054" };
    const loads = pileLoads(f, r).map((v) => v / 1000);
    const chart = echarts.init(ref.current, null, { renderer: "svg", width, height });
    chart.setOption({
      animation: animate,
      textStyle: { fontFamily: FONT },
      tooltip: { trigger: "axis", valueFormatter: (v) => `${v.toFixed(2)} ตัน` },
      grid: { left: 52, right: 20, top: 30, bottom: 40 },
      xAxis: { type: "category", data: loads.map((_, i) => `เข็ม ${i + 1}`), axisLine: { lineStyle: { color: c.axis } }, axisLabel: { color: c.label } },
      yAxis: { type: "value", name: "แรงต่อต้น (ตัน)", nameLocation: "middle", nameGap: 36, min: 0,
        max: (v) => Math.max(v.max, r.Pallow / 1000) * 1.15,
        axisLine: { lineStyle: { color: c.axis } }, axisLabel: { color: c.label }, splitLine: { lineStyle: { color: c.split } } },
      series: [{
        type: "bar", data: loads, barMaxWidth: 46,
        itemStyle: { borderRadius: [6, 6, 0, 0], color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: c.bar }, { offset: 1, color: `${c.bar}66` }]) },
        label: { show: true, position: "top", color: c.text, fontSize: 11, formatter: (p) => p.value.toFixed(2) },
        markLine: { symbol: "none", lineStyle: { color: c.lim, type: "dashed", width: 1.5 },
          label: { color: c.lim, formatter: `กำลังรับที่ยอมให้ ${(r.Pallow / 1000).toFixed(1)} ตัน`, position: "insideEndTop" },
          data: [{ yAxis: r.Pallow / 1000 }] },
      }],
    });
    const ro = width ? null : new ResizeObserver(() => chart.resize());
    ro?.observe(ref.current);
    return () => { ro?.disconnect(); chart.dispose(); };
  }, [f, r, width, height, dark, animate]);
  return <div ref={ref} style={{ width: width ?? "100%", height }} />;
}
