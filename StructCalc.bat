@echo off
rem ===================================================================
rem  StructCalc - ดับเบิลคลิกไฟล์นี้เพื่อเปิดโปรแกรม (Windows)
rem  ครั้งแรก: ดาวน์โหลดโค้ดจาก GitHub + ติดตั้ง  /  ครั้งต่อไป: อัปเดต + เปิด
rem  ต้องมี Node.js (https://nodejs.org) และ Git (https://git-scm.com) ในเครื่อง
rem  วางไฟล์นี้ไว้ที่ไหนก็ได้ (เช่น Desktop) โค้ดจะอยู่ในโฟลเดอร์ structcalc ข้างไฟล์นี้
rem ===================================================================
chcp 65001 >nul
setlocal
set "REPO=https://github.com/nitikorn28646/structcalc.git"
set "BRANCH=feature/review-fixes"
cd /d "%~dp0"

where node >nul 2>nul || (echo [!] ไม่พบ Node.js - ติดตั้งจาก https://nodejs.org แล้วเปิดไฟล์นี้ใหม่ & start https://nodejs.org & pause & exit /b 1)
where git  >nul 2>nul || (echo [!] ไม่พบ Git - ติดตั้งจาก https://git-scm.com แล้วเปิดไฟล์นี้ใหม่ & start https://git-scm.com & pause & exit /b 1)

rem ไฟล์นี้อยู่ในโฟลเดอร์โค้ดเอง (มี web\package.json) หรืออยู่ข้างนอก
set "ROOT=%~dp0structcalc"
if exist "%~dp0web\package.json" set "ROOT=%~dp0."

if not exist "%ROOT%\web\package.json" (
  echo == ดาวน์โหลดโค้ดครั้งแรก ...
  git clone -b %BRANCH% %REPO% "%ROOT%" || (echo [!] ดาวน์โหลดไม่สำเร็จ & pause & exit /b 1)
) else (
  echo == อัปเดตโค้ดล่าสุด ...
  git -C "%ROOT%" pull --ff-only || echo [i] อัปเดตไม่ได้ ^(ไม่มีเน็ตหรือมีไฟล์แก้ในเครื่อง^) - เปิดเวอร์ชันที่มีอยู่
)

cd /d "%ROOT%\web"
rem ติดตั้งเมื่อยังไม่เคยติดตั้ง หรือรายการแพ็กเกจเปลี่ยน
fc /b package-lock.json node_modules\.installed-lock >nul 2>nul
if errorlevel 1 (
  echo == ติดตั้งส่วนประกอบ ^(ครั้งแรกใช้เวลาสักครู่^) ...
  call npm ci || (echo [!] ติดตั้งไม่สำเร็จ & pause & exit /b 1)
  copy /y package-lock.json node_modules\.installed-lock >nul
)

echo == เปิดโปรแกรม ... ^(ปิดหน้าต่างนี้ = ปิดโปรแกรม^)
call npm run dev -- --open
pause
