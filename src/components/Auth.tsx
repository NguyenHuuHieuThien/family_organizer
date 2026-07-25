/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { Lock, User as UserIcon, Home, AlertCircle, Eye, EyeOff, Loader2, ArrowRight, ShieldCheck, Sun, Moon } from "lucide-react";
import { motion } from "motion/react";

interface AuthProps {
  onLoginSuccess: (user: any, token: string) => void;
  theme?: "light" | "dark";
  onToggleTheme?: (e: React.MouseEvent<HTMLButtonElement>) => void;
}

// Các hạt sáng bay lên — sinh 1 lần ở module để vị trí ổn định giữa các lần render.
const PARTICLE_COLORS = ["bg-sky-300/50", "bg-indigo-300/50", "bg-emerald-300/45"];
const PARTICLES = Array.from({ length: 30 }, (_, i) => ({
  left: Math.round((i / 30) * 100 + (i % 3) * 5) % 100,   // rải đều + lệch nhẹ
  size: 3 + (i % 5),                        // 3–7px, đa dạng kích thước
  delay: (i % 10) * 0.8,                    // lệch pha để không bay đồng loạt
  duration: 9 + (i % 7) * 1.8,              // 9–~20s
  drift: (i % 2 === 0 ? 1 : -1) * (10 + (i % 5) * 7),
  rise: 400 + (i % 6) * 90,                 // quãng đường bay lên
  color: PARTICLE_COLORS[i % PARTICLE_COLORS.length],
}));

export function Auth({ onLoginSuccess, theme = "dark", onToggleTheme }: AuthProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);

  const [errorStatus, setErrorStatus] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorStatus("");

    if (!username.trim() || !password) {
      setErrorStatus("Vui lòng điền tài khoản và mật khẩu!");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: username.trim(),
          password
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Mật khẩu không chính xác!");
      }

      onLoginSuccess(data.user, data.token);
    } catch (err: any) {
      setErrorStatus(err.message || "Không thể kết nối đến máy chủ");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 flex flex-col items-center justify-center p-4 selection:bg-sky-200 selection:text-sky-700 font-sans" id="login-container">

      {/* Nền động: aurora xoay + quầng sáng trôi + hạt sáng bay lên + lưới mờ.
          Mask radial: gom sáng vào giữa (sau thẻ), mờ dần về mép để mép luôn sạch. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden [mask-image:radial-gradient(ellipse_at_center,#000_38%,transparent_75%)] [-webkit-mask-image:radial-gradient(ellipse_at_center,#000_38%,transparent_75%)]"
      >
        {/* Vòng aurora gradient xoay chậm phía sau thẻ */}
        <motion.div
          className="absolute left-1/2 top-1/2 w-[42rem] h-[42rem] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-30 blur-[100px]"
          style={{ background: "conic-gradient(from 0deg, rgba(14,165,233,0.35), rgba(99,102,241,0.30), rgba(16,185,129,0.25), rgba(168,85,247,0.28), rgba(14,165,233,0.35))" }}
          animate={{ rotate: 360 }}
          transition={{ duration: 44, repeat: Infinity, ease: "linear" }}
        />

        {/* Quầng sáng trôi nhẹ + khẽ phập phồng */}
        <motion.div
          className="absolute -top-28 -left-24 w-96 h-96 rounded-full bg-sky-500/15 blur-[110px]"
          animate={{ y: [0, 30, 0], x: [0, 18, 0], scale: [1, 1.12, 1] }}
          transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute top-1/3 -right-24 w-[26rem] h-[26rem] rounded-full bg-indigo-500/15 blur-[120px]"
          animate={{ y: [0, -26, 0], scale: [1, 1.08, 1] }}
          transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute -bottom-28 left-1/4 w-96 h-96 rounded-full bg-emerald-500/10 blur-[120px]"
          animate={{ y: [0, -18, 0], x: [0, -16, 0], scale: [1, 1.1, 1] }}
          transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
        />

        {/* Hạt sáng bay lên */}
        {PARTICLES.map((p, i) => (
          <motion.span
            key={i}
            className={`absolute bottom-0 rounded-full ${p.color}`}
            style={{ left: `${p.left}%`, width: p.size, height: p.size }}
            animate={{ y: [10, -p.rise], x: [0, p.drift, 0], opacity: [0, 0.9, 0] }}
            transition={{ duration: p.duration, repeat: Infinity, delay: p.delay, ease: "easeInOut" }}
          />
        ))}

        {/* Lưới mờ tinh tế */}
        <div className="absolute inset-0 opacity-[0.025] bg-[linear-gradient(to_right,currentColor_1px,transparent_1px),linear-gradient(to_bottom,currentColor_1px,transparent_1px)] bg-[size:46px_46px] text-slate-400" />
      </div>

      {/* Nút đổi Sáng/Tối — góc trên phải, tôn trọng notch iPhone */}
      {onToggleTheme && (
        <button
          type="button"
          onClick={onToggleTheme}
          title={theme === "light" ? "Chuyển sang Giao diện Tối" : "Chuyển sang Giao diện Sáng"}
          aria-label={theme === "light" ? "Chuyển sang Giao diện Tối" : "Chuyển sang Giao diện Sáng"}
          className="absolute right-4 top-[calc(env(safe-area-inset-top)_+_1rem)] z-20 p-2.5 text-slate-400 hover:text-slate-100 bg-slate-900 neu-btn rounded-xl leading-none cursor-pointer group flex items-center justify-center"
        >
          {theme === "light" ? (
            <Moon className="w-4.5 h-4.5 transition-transform group-hover:scale-110" />
          ) : (
            <Sun className="w-4.5 h-4.5 text-amber-500 transition-transform group-hover:rotate-45" />
          )}
        </button>
      )}

      <motion.div
        initial={{ opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="relative w-full max-w-md bg-slate-900 neu-raised p-7 sm:p-8 rounded-[1.75rem] space-y-7 z-10"
      >
        {/* Logo + tiêu đề */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12, duration: 0.4 }}
          className="text-center space-y-3"
        >
          <div className="relative inline-flex">
            <div aria-hidden className="absolute inset-0 rounded-2xl bg-sky-500/40 blur-xl" />
            <div className="relative inline-flex bg-gradient-to-br from-sky-500 to-indigo-500 p-3.5 rounded-2xl text-white leading-none shadow-lg shadow-sky-500/25">
              <Home className="w-8 h-8" />
            </div>
          </div>
          <div className="space-y-1">
            <h2 className="text-2xl font-extrabold tracking-tight bg-gradient-to-r from-sky-400 via-sky-300 to-indigo-400 bg-clip-text text-transparent">
              Family Organizer
            </h2>
            <p className="text-slate-500 text-xs text-balance">Hệ thống cộng tác hằng ngày của gia đình thân thương</p>
          </div>
        </motion.div>

        {errorStatus && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl text-xs font-semibold flex items-center gap-2"
          >
            <AlertCircle className="w-4.5 h-4.5 shrink-0" />
            <span>{errorStatus}</span>
          </motion.div>
        )}

        {/* Biểu mẫu */}
        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div className="space-y-1.5">
            <label className="text-slate-400 block font-semibold">Tên tài khoản</label>
            <div className="relative group">
              <UserIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-sky-400 transition-colors" />
              <input
                type="text"
                placeholder="Nhập tên đăng nhập gia đình..."
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                className="w-full bg-slate-950 neu-pressed-sm rounded-xl py-2.5 pl-10 pr-4 text-slate-200 outline-none transition-all focus:ring-2 focus:ring-sky-500/30"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-slate-400 block font-semibold">Mật khẩu</label>
            <div className="relative group">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-sky-400 transition-colors" />
              <input
                type={showPwd ? "text" : "password"}
                placeholder="Mật khẩu của từng thành viên..."
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                className="w-full bg-slate-950 neu-pressed-sm rounded-xl py-2.5 pl-10 pr-11 text-slate-200 outline-none transition-all focus:ring-2 focus:ring-sky-500/30"
              />
              <button
                type="button"
                onClick={() => setShowPwd(s => !s)}
                tabIndex={-1}
                aria-label={showPwd ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-slate-500 hover:text-slate-300 rounded-lg transition-colors cursor-pointer"
              >
                {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="group w-full bg-gradient-to-r from-sky-500 to-indigo-500 hover:from-sky-400 hover:to-indigo-400 text-white font-bold py-2.5 px-4 rounded-xl cursor-pointer select-none transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-sky-500/20 text-xs"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Đang xác thực...
              </>
            ) : (
              <>
                Đăng nhập Gia Đình
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </>
            )}
          </button>
        </form>

        {/* Chân trang: nhấn mạnh tính riêng tư của server gia đình */}
        <p className="text-center text-[10px] text-slate-600 flex items-center justify-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-500/70" />
          Dữ liệu riêng tư • Chạy trên máy chủ của gia đình
        </p>
      </motion.div>
    </div>
  );
}
