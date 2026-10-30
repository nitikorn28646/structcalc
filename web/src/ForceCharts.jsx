// Shear force and bending moment diagrams (Apache ECharts, SVG renderer so they print crisply).
import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import { LineChart } from "echarts/charts";
import { GridComponent, MarkPointComponent, TooltipComponent } from "echarts/components";
import { SVGRenderer } from "echarts/renderers";

echarts.use([LineChart, GridComponent, TooltipComponent, MarkPointComponent, SVGRenderer]);

const FONT = "Sarabun, Leelawadee UI, sans-serif";
const n0 = (v) => Math.round(v).toLocaleString("en-US");

function sample(L, f, N = 120) {
  return Array.from({ length: N + 1 }, (_, k) => {
    const x = (L * k) / N;
    return [Number(x.toFixed(4)), f(x)];
  });
}

const THEME = {
  light: { axis: "#475467", label: "#667085", name: "#344054", split: "#eaecf0", value: "#1d2939", valueBg: "rgba(255,255,255,0.85)", V: "#12b76a", M: "#465fff" },
  dark: { axis: "#6e7591", label: "#9097b1", name: "#cdd1e2", split: "#2c3250", value: "#f2f4fa", valueBg: "rgba(24,28,48,0.85)", V: "#4ade80", M: "#7b8cff" },
};

function option({ L, fns, animate, height, dark }) {
  const c = THEME[dark ? "dark" : "light"];
  const gh = (height - 115) / 2; // two plots, 30 px top, 40 px between, 45 px for the x axis
  const V = sample(L, fns.V), M = sample(L, fns.M);
  const axisX = (gridIndex, show) => ({
    type: "value", gridIndex, min: 0, max: L, name: show ? "x (m)" : "", nameGap: 22, nameLocation: "middle",
    axisLine: { onZero: true, lineStyle: { color: c.axis } }, axisTick: { show },
    axisLabel: { show, color: c.label, fontFamily: FONT }, splitLine: { show: false },
  });
  const axisY = (gridIndex, name) => ({
    type: "value", gridIndex, name, nameLocation: "middle", nameGap: 52, nameRotate: 90,
    nameTextStyle: { color: c.name, fontFamily: FONT, fontWeight: 600 },
    axisLabel: { color: c.label, fontFamily: FONT, formatter: n0 }, splitLine: { lineStyle: { color: c.split } },
  });
  const series = (name, data, idx, color, unit) => ({
    name, type: "line", xAxisIndex: idx, yAxisIndex: idx, data, showSymbol: false, smooth: false,
    lineStyle: { color, width: 2.2, shadowColor: color, shadowBlur: dark ? 8 : 0 },
    areaStyle: {
      origin: 0,
      color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
        { offset: 0, color: `${color}${dark ? "66" : "4d"}` }, { offset: 0.5, color: `${color}14` }, { offset: 1, color: `${color}${dark ? "66" : "4d"}` },
      ]),
    },
    markPoint: {
      symbol: "circle", symbolSize: 6, itemStyle: { color },
      label: { show: true, position: "top", color: c.value, fontFamily: FONT, fontSize: 11,
        formatter: (p) => `${n0(p.value)} ${unit}`, backgroundColor: c.valueBg, padding: [1, 3] },
      data: [{ type: "max", name: "max" }, { type: "min", name: "min", label: { position: "bottom" } }],
    },
  });
  return {
    animation: animate,
    textStyle: { fontFamily: FONT },
    tooltip: {
      trigger: "axis", axisPointer: { type: "line" },
      formatter: (ps) => `x = ${ps[0].value[0].toFixed(2)} m<br/>` +
        ps.map((p) => `${p.marker}${p.seriesName} = ${n0(p.value[1])}`).join("<br/>"),
    },
    grid: [{ left: 70, right: 70, top: 30, height: gh }, { left: 70, right: 70, top: 30 + gh + 40, height: gh }],
    xAxis: [axisX(0, false), axisX(1, true)],
    yAxis: [axisY(0, "V (kg)"), axisY(1, "M (kg-m)")],
    series: [series("V", V, 0, c.V, "kg"), series("M", M, 1, c.M, "kg-m")],
  };
}

export default function ForceCharts({ L, fns, dark = false, width, height = 340, animate = true, className = "" }) {
  const ref = useRef(null);
  useEffect(() => {
    const chart = echarts.init(ref.current, null, { renderer: "svg", width, height });
    chart.setOption(option({ L, fns, animate, height, dark }));
    const ro = width ? null : new ResizeObserver(() => chart.resize());
    ro?.observe(ref.current);
    return () => { ro?.disconnect(); chart.dispose(); };
  }, [L, fns, width, height, animate, dark]);
  return <div ref={ref} className={className} style={{ width: width ?? "100%", height }} />;
}

