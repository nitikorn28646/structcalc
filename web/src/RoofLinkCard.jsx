// "Roof → columns" status card shown on top of step 5 and in step 6: one button builds the roof from the structure and links its
// loads to the top floor; the card says what is linked, how much load, and where loads had to move to the nearest column.
export function RoofLinkCard({ frame, roof, onFromFrame }) {
  const link = frame.roofLink, pts = frame.roofPoints ?? [], total = pts.reduce((s, p) => s + p.P, 0), moved = pts.filter((p) => String(p.name).includes("ย้าย"));
  const ready = roof?.fromFrame && link?.on;
  return (
    <div className={`flex flex-wrap items-center gap-3 rounded-xl px-3 py-2 text-[12px] ring-1 ${ready ? "bg-[#ecfdf3] text-[#067647] ring-[#abefc6]" : "bg-[#fffaeb] text-[#b54708] ring-[#fdb022]"}`}>
      <span className="font-semibold">หลังคา → เสา</span>
      {ready ? <span>แรงหลังคา {(total / 1000).toFixed(2)} ตัน ลง {pts.length} จุด ที่ {frame.floors[link.floor]?.name}{moved.length ? ` · ${moved.length} จุดไม่มีเสาใต้ ย้ายไปเสาใกล้สุด (ดูคำเตือน)` : ""} · อัปเดตเองเมื่อแก้หลังคา</span>
        : <span>{roof?.fromFrame ? "สร้างหลังคาแล้วแต่ยังไม่ได้ส่งแรงลงเสา" : "หลังคายังไม่ได้ใช้แปลนจากโครงสร้าง — แรงหลังคายังไม่ลงเสา"}</span>}
      <button onClick={onFromFrame} className={`ml-auto rounded-lg px-3 py-1 font-medium ${ready ? "ring-1 ring-current" : "bg-brand-500 text-[#fff]"}`}>{ready ? "สร้างใหม่จากโครงสร้าง" : "สร้างหลังคาจากโครงสร้าง + ส่งแรงลงเสา"}</button>
    </div>
  );
}
