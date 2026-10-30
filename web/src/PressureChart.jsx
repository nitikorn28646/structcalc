// Net soil pressure distribution across the footing along x and along y (Apache ECharts, SVG renderer).
import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import { LineChart } from "echarts/charts";
import { GridComponent, LegendComponent, MarkLineComponent, TooltipComponent } from "echarts/components";
import { SVGRenderer } from "echarts/renderers";

echarts.use([LineChart, GridComponent, LegendComponent, MarkLineComponent, TooltipComponent, SVGRenderer]);
const FONT = "Sarabun, Leelawadee UI, sans-serif";

export default function PressureChart({ f, r, width, height = 330, dark = false, animate = true }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = dark
      ? { axis: "#6e7591", label: "#9097b1", split: "#2c3250", X: "#7b8cff", Y: "#4ade80", qa: "#f87171", text: "#cdd1e2" }
      : { axis: "#475467", label: "#667085", split: "#eaecf0", X: "#465fff", Y: "#12b76a", qa: "#f04438", text: "#344054" };
    const t = (v) => Math.round(v) / 1000; // kg/m² → t/m²
    const area = (color) => ({ color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: `${color}55` }, { offset: 1, color: `${color}08` }]) });
    const gross = (qmin, qmax) => [[0, t(qmin)], [1, t(qmax)]];
    const chart = echarts.init(ref.current, null, { renderer: "svg", width, height });
    chart.setOption({
      animation: animate,
      textStyle: { fontFamily: FONT },
      legend: { top: 0, right: 8, textStyle: { color: c.text, fontSize: 11 }, itemWidth: 14 },
      tooltip: { trigger: "axis", valueFormatter: (v) => `${v.toFixed(2)} t/m²` },
      grid: { left: 52, right: 20, top: 34, bottom: 44 },
      xAxis: { type: "value", min: 0, max: 1, name: "ตำแหน่งจากขอบแรงดันน้อย → มาก (สัดส่วนความยาวฐาน)", nameLocation: "middle", nameGap: 26,
        nameTextStyle: { color: c.label, fontSize: 10 }, axisLine: { lineStyle: { color: c.axis } }, axisLabel: { color: c.label } },
      yAxis: { type: "value", name: "q (t/m²)", nameLocation: "middle", nameGap: 36, min: 0,
        axisLine: { lineStyle: { color: c.axis } }, axisLabel: { color: c.label }, splitLine: { lineStyle: { color: c.split } } },
      series: [
        { name: "แรงดันดินรวม แนว x", type: "line", data: gross(r.qminX, r.qmaxX), symbolSize: 7, lineStyle: { color: c.X, width: 2.2 }, itemStyle: { color: c.X }, areaStyle: area(c.X),
          label: { show: true, color: c.text, fontSize: 10, formatter: (p) => p.value[1].toFixed(2) },
          markLine: { symbol: "none", lineStyle: { color: c.qa, type: "dashed" }, label: { color: c.qa, formatter: `qa = ${t(f.qa)} t/m²` }, data: [{ yAxis: t(f.qa) }] } },
        { name: "แรงดันดินรวม แนว y", type: "line", data: gross(r.qminY, r.qmaxY), symbolSize: 7, lineStyle: { color: c.Y, width: 2.2, type: "dashed" }, itemStyle: { color: c.Y },
          label: { show: true, position: "bottom", color: c.text, fontSize: 10, formatter: (p) => p.value[1].toFixed(2) } },
      ],
    });
    const ro = width ? null : new ResizeObserver(() => chart.resize());
    ro?.observe(ref.current);
    return () => { ro?.disconnect(); chart.dispose(); };
  }, [f, r, width, height, dark, animate]);
  return <div ref={ref} style={{ width: width ?? "100%", height }} />;
}
