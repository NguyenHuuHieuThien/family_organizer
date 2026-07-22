/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { Lock, User as UserIcon, Home, AlertCircle } from "lucide-react";
import { motion } from "motion/react";

interface AuthProps {
  onLoginSuccess: (user: any, token: string) => void;
}

export function Auth({ onLoginSuccess }: AuthProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  
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
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 selection:bg-sky-200 selection:text-sky-700 font-sans" id="login-container">
      
      {/* Visual background decoration */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 bg-sky-500/10 rounded-full blur-[90px] pointer-events-none" />

      <motion.div 
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-slate-900 border border-slate-800 p-6 rounded-3xl shadow-2xl space-y-6 z-10"
      >
        {/* Upper visual logo */}
        <div className="text-center space-y-2">
          <div className="inline-flex bg-sky-500/10 p-3 rounded-2xl text-sky-400 border border-sky-500/10 mb-1 leading-none shadow-inner shadow-sky-400/5">
            <Home className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-extrabold text-slate-100 tracking-tight">Family Organizer</h2>
          <p className="text-slate-500 text-xs text-balance">Hệ thống cộng tác hằng ngày của gia đình thân thương</p>
        </div>

        {errorStatus && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl text-xs font-semibold flex items-center gap-2">
            <AlertCircle className="w-4.5 h-4.5 shrink-0" />
            <span>{errorStatus}</span>
          </div>
        )}

        {/* Input Form */}
        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div className="space-y-1.5">
            <label className="text-slate-400 block font-semibold">Tên tài khoản</label>
            <div className="relative">
              <UserIcon className="absolute left-3.5 top-3 w-4 h-4 text-slate-500" />
              <input 
                type="text" 
                placeholder="Nhập tên đăng nhập gia đình..."
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-slate-950 neu-pressed-sm focus:border-sky-500 rounded-xl py-2.5 pl-10 pr-4 text-slate-200 outline-none transition-all"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-slate-400 block font-semibold">Mật khẩu</label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-3 w-4 h-4 text-slate-500" />
              <input 
                type="password" 
                placeholder="Mật khẩu của từng thành viên..."
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-950 neu-pressed-sm focus:border-sky-500 rounded-xl py-2.5 pl-10 pr-4 text-slate-200 outline-none transition-all"
              />
            </div>
          </div>

          <button 
            type="submit"
            disabled={loading}
            className="w-full bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold py-2.5 px-4 rounded-xl cursor-pointer select-none transition-all disabled:opacity-50 text-center text-xs"
          >
            {loading ? "Đang xác thực..." : "Đăng nhập Gia Đình"}
          </button>
        </form>

      </motion.div>
    </div>
  );
}
