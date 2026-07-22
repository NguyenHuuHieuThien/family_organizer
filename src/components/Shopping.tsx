/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useRef, useEffect } from "react";
import { ShoppingCart, Plus, Trash2, CheckCircle2, Circle, Eraser, ChefHat, Sparkles, Loader2, Shuffle } from "lucide-react";
import { ShoppingItem, User, UserRole, StoredMealPlan } from "../types.js";
import { motion, AnimatePresence } from "motion/react";
import { useConfirm } from "./ConfirmDialog.js";
import { useTabFab } from "./FabHost.js";
import { ShimmerLine, Reveal, IconChip } from "./Lively.js";
import { generateMealPlan, FOOD_CATEGORY_ORDER, GroceryLine, FoodCategory } from "../utils/mealPlan.js";
import { classifyMarketZone, MARKET_ZONE_ORDER, MARKET_ZONE_META, MarketZone } from "../utils/marketZones.js";

const WEEKDAYS = ["Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7", "Chủ nhật"];
const dayLabel = (i: number) => (i < WEEKDAYS.length ? WEEKDAYS[i] : `Ngày ${i + 1}`);

// Ghi chú "dùng ở buổi nào / cho món nào" (đầy đủ chữ) cho một nguyên liệu.
function groceryNote(g: { meals?: string[]; dishes?: string[] }): string {
  const meals = g.meals?.length ? g.meals.join(", ") : "";
  const dishes = g.dishes?.length
    ? g.dishes.slice(0, 4).join(", ") + (g.dishes.length > 4 ? "…" : "")
    : "";
  return meals && dishes ? `${meals} · ${dishes}` : (meals || dishes || "");
}

// Weekly menu table.
function MealTable({ days }: { days: { day: number; meals: { meal: string; dishes: string[] }[] }[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-800">
      <table className="w-full text-[11px] border-collapse">
        <thead>
          <tr>
            <th className="bg-slate-950 px-2 py-1.5 text-left font-bold text-slate-400 border-b border-slate-800 sticky left-0">Ngày</th>
            <th className="bg-slate-950 px-2 py-1.5 font-bold text-amber-400 border-b border-l border-slate-800">Sáng</th>
            <th className="bg-slate-950 px-2 py-1.5 font-bold text-emerald-400 border-b border-l border-slate-800">Trưa</th>
            <th className="bg-slate-950 px-2 py-1.5 font-bold text-sky-400 border-b border-l border-slate-800">Tối</th>
          </tr>
        </thead>
        <tbody>
          {days.map((d, i) => {
            const cell = (meal: string) => d.meals.find(m => m.meal === meal)?.dishes.join(", ") || "—";
            return (
              <tr key={d.day} className="align-top border-t border-slate-800">
                <td className="bg-slate-950/60 px-2 py-1.5 font-bold text-slate-300 whitespace-nowrap sticky left-0">{dayLabel(i)}</td>
                <td className="px-2 py-1.5 text-slate-300 border-l border-slate-800">{cell("Sáng")}</td>
                <td className="px-2 py-1.5 text-slate-300 border-l border-slate-800">{cell("Trưa")}</td>
                <td className="px-2 py-1.5 text-slate-300 border-l border-slate-800">{cell("Tối")}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

interface ShoppingProps {
  currentUser: User;
  users: User[];
  shoppingItems: ShoppingItem[];
  onSaveItem: (data: Partial<ShoppingItem>) => Promise<any>;
  onToggleItem: (id: string) => Promise<any>;
  onDeleteItem: (id: string) => Promise<any>;
  onClearPurchased: () => Promise<any>;
  onClearAll: () => Promise<any>;
  authHeaders: Record<string, string>;
}

export function Shopping({
  currentUser,
  users,
  shoppingItems,
  onSaveItem,
  onToggleItem,
  onDeleteItem,
  onClearPurchased,
  onClearAll,
  authHeaders
}: ShoppingProps) {
  const { confirm, ConfirmDialog } = useConfirm();
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);

  // Ô nhập tên món — nút nổi sẽ cuộn lên đây và focus để thêm nhanh
  const nameInputRef = useRef<HTMLInputElement>(null);
  const focusAddItem = () => {
    nameInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    nameInputRef.current?.focus();
  };
  useTabFab({ id: "shopping", color: "emerald", title: "Thêm món cần mua", icon: ShoppingCart, onClick: focusAddItem });

  // ===== Thực đơn tuần (gắn ngay trên trang, lưu chung trong CSDL) =====
  const isChildUser = (u: User) => {
    if (u.role === UserRole.CHILD || u.familyRelation === "con") return true;
    if (u.dateOfBirth) {
      const age = (Date.now() - new Date(u.dateOfBirth).getTime()) / (365.25 * 24 * 3600 * 1000);
      if (age > 0 && age < 16) return true;
    }
    return false;
  };
  // Tự suy khẩu phần từ thành viên (bỏ qua khách); người dùng vẫn chỉnh được.
  const householdDefaults = useMemo(() => {
    const members = users.filter(u => u.role !== UserRole.GUEST && u.familyRelation !== "khach");
    const children = members.filter(isChildUser).length;
    const adults = members.length - children;
    return { adults: Math.max(1, adults), children };
  }, [users]);

  // Inputs are free-typed strings (cho phép xoá, gõ lại, không kẹt ở 1/7); chỉ
  // chuyển sang số + kẹp ngưỡng khi dùng hoặc khi rời ô (onBlur).
  const [adultsInput, setAdultsInput] = useState(String(householdDefaults.adults));
  const [childrenInput, setChildrenInput] = useState(String(householdDefaults.children));
  const [daysInput, setDaysInput] = useState("7");
  const [planNotes, setPlanNotes] = useState("");

  const sanitizeInt = (v: string) => v.replace(/\D/g, "").replace(/^0+(?=\d)/, ""); // bỏ ký tự lạ + số 0 đứng đầu
  const clampInt = (s: string, min: number, max: number, fallback: number) => {
    const n = parseInt(s, 10);
    return isNaN(n) ? fallback : Math.max(min, Math.min(max, n));
  };
  const planAdults = clampInt(adultsInput, 0, 10, householdDefaults.adults);
  const planChildren = clampInt(childrenInput, 0, 10, householdDefaults.children);
  const planDays = clampInt(daysInput, 1, 7, 7);
  const [weekPlan, setWeekPlan] = useState<StoredMealPlan | null>(null);
  const [planBusy, setPlanBusy] = useState<"" | "random" | "ai" | "add">("");
  const [planError, setPlanError] = useState("");
  const [aiEnabled, setAiEnabled] = useState(false);
  const [excluded, setExcluded] = useState<Set<string>>(new Set()); // nguyên liệu bỏ chọn
  const [addedCount, setAddedCount] = useState<number | null>(null);
  const [aiLearned, setAiLearned] = useState<number | null>(null);
  const didInitControls = useRef(false);

  // Tải thực đơn tuần khi mở trang & mỗi khi danh sách đi chợ đồng bộ lại
  // (đổi/tạo thực đơn broadcast SHOPPING_UPDATE → App nạp lại shoppingItems → đồng bộ cả nhà).
  useEffect(() => {
    let alive = true;
    fetch("/api/shopping/meal-plan/current", { headers: authHeaders })
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (!alive || !d) return;
        setWeekPlan(d.mealPlan || null);
        if (!didInitControls.current && d.mealPlan) {
          didInitControls.current = true;
          setAdultsInput(String(d.mealPlan.adults || householdDefaults.adults));
          setChildrenInput(String(typeof d.mealPlan.children === "number" ? d.mealPlan.children : householdDefaults.children));
          setDaysInput(String(d.mealPlan.days?.length || 7));
        }
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [shoppingItems]);

  useEffect(() => {
    fetch("/api/version", { headers: authHeaders })
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d) setAiEnabled(!!d.aiEnabled); })
      .catch(() => {});
  }, []);

  // Tạo/đổi thực đơn tuần chung — random (từ thư viện món CSDL) hoặc AI; cả hai đều lưu shared.
  const regenerate = async (mode: "random" | "ai") => {
    setPlanBusy(mode);
    setPlanError("");
    setAddedCount(null);
    if (mode === "ai") setAiLearned(null);
    // Đừng để quay vòng vô tận: tự huỷ nếu chờ quá lâu (AI 75s, random 20s).
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), mode === "ai" ? 75000 : 20000);
    try {
      const url = mode === "ai" ? "/api/shopping/meal-plan" : "/api/shopping/meal-plan/random";
      const body = mode === "ai"
        ? { adults: planAdults, children: planChildren, days: planDays, notes: planNotes }
        : { adults: planAdults, children: planChildren, days: planDays, save: true };
      const res = await fetch(url, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không tạo được thực đơn.");
      setWeekPlan({
        days: data.days,
        groceries: data.groceries,
        source: data.source,
        adults: planAdults,
        children: planChildren,
        updatedAt: new Date().toISOString(),
        updatedById: currentUser.id
      });
      setExcluded(new Set());
      if (mode === "ai") setAiLearned(typeof data.learned === "number" ? data.learned : null);
    } catch (err: any) {
      if (mode === "random") {
        // Mất mạng/máy chủ — vẫn lập được từ bộ món mẫu sẵn trên máy (không lưu chung).
        const local = generateMealPlan({ adults: planAdults, children: planChildren, days: planDays });
        setWeekPlan({
          days: local.days, groceries: local.groceries, source: local.source,
          adults: planAdults, children: planChildren,
          updatedAt: new Date().toISOString(), updatedById: currentUser.id
        });
        setExcluded(new Set());
        setPlanError("Dùng bộ món mẫu (không kết nối được máy chủ): " + (err?.message || ""));
      } else if (err?.name === "AbortError") {
        setPlanError("AI phản hồi quá lâu (có thể đang quá tải). Hãy giảm số ngày rồi thử lại, hoặc dùng \"Đổi thực đơn\".");
      } else {
        setPlanError(err.message || "Không tạo được thực đơn AI.");
      }
    } finally {
      clearTimeout(timer);
      setPlanBusy("");
    }
  };

  const toggleGrocery = (groceryName: string) => {
    setExcluded(prev => {
      const next = new Set(prev);
      if (next.has(groceryName)) next.delete(groceryName); else next.add(groceryName);
      return next;
    });
  };

  const addSelectedToList = async () => {
    if (!weekPlan) return;
    const existing = new Set(shoppingItems.filter(i => !i.isPurchased).map(i => i.name.trim().toLowerCase()));
    const toAdd = weekPlan.groceries.filter(g => !excluded.has(g.name) && !existing.has(g.name.trim().toLowerCase()));
    if (toAdd.length === 0) { setAddedCount(0); return; }
    setPlanBusy("add");
    setPlanError("");
    try {
      for (const g of toAdd) {
        await onSaveItem({ name: g.name, quantity: g.quantity, note: groceryNote(g), cat: g.cat });
      }
      setAddedCount(toAdd.length);
    } catch (err: any) {
      setPlanError(err.message || "Không thêm được vào danh sách.");
    } finally {
      setPlanBusy("");
    }
  };

  const groceryByCat = useMemo(() => {
    const map = new Map<FoodCategory, GroceryLine[]>();
    weekPlan?.groceries.forEach(g => {
      const arr = map.get(g.cat) || [];
      arr.push(g);
      map.set(g.cat, arr);
    });
    return FOOD_CATEGORY_ORDER.filter(c => map.has(c)).map(c => ({ cat: c, items: map.get(c)! }));
  }, [weekPlan]);

  const selectedCount = weekPlan ? weekPlan.groceries.filter(g => !excluded.has(g.name)).length : 0;

  const pending = useMemo(
    () => shoppingItems.filter(i => !i.isPurchased).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [shoppingItems]
  );
  const purchased = useMemo(
    () => shoppingItems.filter(i => i.isPurchased).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [shoppingItems]
  );

  // Gom danh sách "Cần mua" theo KHU QUẦY chợ/siêu thị — người đi chợ đi tới
  // khu nào là mua đủ đồ khu đó, không phải chạy tới chạy lui.
  const pendingByZone = useMemo(() => {
    const map = new Map<MarketZone, ShoppingItem[]>();
    for (const it of pending) {
      const zone = classifyMarketZone(it.name, it.cat);
      const arr = map.get(zone);
      if (arr) arr.push(it); else map.set(zone, [it]);
    }
    return MARKET_ZONE_ORDER.filter(z => map.has(z)).map(z => ({ zone: z, items: map.get(z)! }));
  }, [pending]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!name.trim()) {
      setError("Nhập tên món cần mua!");
      return;
    }
    setAdding(true);
    try {
      await onSaveItem({ name: name.trim(), quantity: quantity.trim() });
      setName("");
      setQuantity("");
    } catch (err: any) {
      setError(err.message || "Không thêm được món này");
    } finally {
      setAdding(false);
    }
  };

  const handleClearPurchased = async () => {
    const ok = await confirm({
      title: "Xóa các món đã mua?",
      message: `${purchased.length} món đã đánh dấu hoàn thành sẽ bị xóa khỏi danh sách đi chợ.`,
      confirmLabel: "Xóa hết đã mua",
      tone: "danger"
    });
    if (ok) await onClearPurchased();
  };

  const handleClearAll = async () => {
    const ok = await confirm({
      title: "Xóa tất cả món đi chợ?",
      message: `Toàn bộ ${shoppingItems.length} món (cả chưa mua và đã mua) sẽ bị xóa khỏi danh sách. Không thể hoàn tác.`,
      confirmLabel: "Xóa tất cả",
      tone: "danger"
    });
    if (ok) await onClearAll();
  };

  const renderItem = (item: ShoppingItem, done: boolean) => {
    const creator = users.find(u => u.id === item.creatorId);
    return (
      <motion.div
        key={item.id}
        layout
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        className="flex items-center gap-3 p-3 bg-slate-950/60 border border-slate-800/60 rounded-xl hover:bg-slate-800/30 transition-all group"
      >
        <button
          onClick={() => onToggleItem(item.id)}
          className={`shrink-0 transition-all cursor-pointer ${done ? "text-emerald-400" : "text-slate-500 hover:text-emerald-400"}`}
          title={done ? "Bỏ đánh dấu" : "Đánh dấu đã mua"}
        >
          {done ? <CheckCircle2 className="w-5 h-5" /> : <Circle className="w-5 h-5" />}
        </button>

        <div className="flex-1 min-w-0">
          <p className={`text-sm font-semibold truncate ${done ? "line-through text-slate-500" : "text-slate-200"}`}>
            {item.name}
            {item.quantity ? <span className="text-slate-500 font-normal"> · {item.quantity}</span> : null}
          </p>
          {item.note && (
            <p className={`text-[10px] leading-snug ${done ? "text-slate-600" : "text-slate-400"}`}>
              <ChefHat className="w-2.5 h-2.5 inline-block mr-0.5 -mt-0.5 text-slate-500" />{item.note}
            </p>
          )}
          <p className="text-[10px] text-slate-500">
            {creator ? creator.fullName.split(" ").slice(-1)[0] : "Thành viên"} thêm
          </p>
        </div>

        {(currentUser.role === "admin" || item.creatorId === currentUser.id) && (
          <button
            onClick={() => onDeleteItem(item.id)}
            className="shrink-0 p-1.5 bg-slate-950 neu-btn hover:bg-slate-800 text-slate-500 hover:text-rose-400 rounded-lg opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
            title="Xóa món này"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </motion.div>
    );
  };

  return (
    <div className="space-y-6" id="shopping-module">
      {/* Add item bar */}
      <Reveal className="relative overflow-hidden bg-slate-900 neu-raised p-4.5 rounded-2xl shadow-xl space-y-3" id="shopping-add">
        <ShimmerLine accent="emerald" />
        <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
          <IconChip accent="emerald"><ShoppingCart className="w-4 h-4" /></IconChip> Danh sách đi chợ chung
        </h3>
        <form onSubmit={handleAdd} className="flex flex-col sm:flex-row gap-2.5">
          <input
            ref={nameInputRef}
            type="text"
            placeholder="Tên món cần mua (vd: Sữa tươi, Rau cải...)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1 bg-slate-950 neu-pressed-sm focus:border-emerald-500 rounded-xl px-3.5 py-2.5 text-slate-200 placeholder-slate-500 text-xs focus:outline-none transition-all"
          />
          <input
            type="text"
            placeholder="Số lượng (tùy chọn)"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className="sm:w-40 bg-slate-950 neu-pressed-sm focus:border-emerald-500 rounded-xl px-3.5 py-2.5 text-slate-200 placeholder-slate-500 text-xs focus:outline-none transition-all"
          />
          <button
            type="submit"
            disabled={adding}
            className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 px-4 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4" /> Thêm
          </button>
        </form>
        {error && <p className="text-rose-400 text-[11px] font-medium">{error}</p>}
      </Reveal>

      {/* Weekly menu planner — inline (no popup): shared, persisted, re-randomizable + add to cart */}
      <Reveal delay={0.06} className="relative overflow-hidden bg-slate-900 neu-raised rounded-2xl p-4.5 space-y-3 text-xs" id="shopping-weekly-menu">
        <ShimmerLine accent="violet" />
        <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
          <IconChip accent="violet"><ChefHat className="w-4 h-4" /></IconChip> Thực đơn tuần
        </h3>

        {/* Khẩu phần */}
        <div className="grid grid-cols-3 gap-2.5">
          <label className="space-y-1">
            <span className="text-slate-400 font-semibold block">Người lớn</span>
            <input type="text" inputMode="numeric" value={adultsInput}
              onChange={(e) => setAdultsInput(sanitizeInt(e.target.value).slice(0, 2))}
              onBlur={() => setAdultsInput(String(clampInt(adultsInput, 0, 10, householdDefaults.adults)))}
              className="w-full bg-slate-950 neu-pressed-sm rounded-xl px-3 py-2.5 text-slate-200 outline-none focus:border-emerald-500 font-bold" />
          </label>
          <label className="space-y-1">
            <span className="text-slate-400 font-semibold block">Trẻ em</span>
            <input type="text" inputMode="numeric" value={childrenInput}
              onChange={(e) => setChildrenInput(sanitizeInt(e.target.value).slice(0, 2))}
              onBlur={() => setChildrenInput(String(clampInt(childrenInput, 0, 10, householdDefaults.children)))}
              className="w-full bg-slate-950 neu-pressed-sm rounded-xl px-3 py-2.5 text-slate-200 outline-none focus:border-emerald-500 font-bold" />
          </label>
          <label className="space-y-1">
            <span className="text-slate-400 font-semibold block">Số ngày</span>
            <input type="text" inputMode="numeric" value={daysInput}
              onChange={(e) => setDaysInput(sanitizeInt(e.target.value).slice(0, 1))}
              onBlur={() => setDaysInput(String(clampInt(daysInput, 1, 7, 7)))}
              className="w-full bg-slate-950 neu-pressed-sm rounded-xl px-3 py-2.5 text-slate-200 outline-none focus:border-emerald-500 font-bold" />
          </label>
        </div>

        {/* Lưu ý cho AI */}
        {aiEnabled && (
          <label className="space-y-1 block">
            <span className="text-slate-400 font-semibold block">Lưu ý cho AI (dị ứng, kiêng khem, ngân sách, sở thích…)</span>
            <textarea value={planNotes} onChange={(e) => setPlanNotes(e.target.value)} rows={2}
              placeholder="VD: bé út dị ứng hải sản, hạn chế đồ chiên, ưu tiên món rẻ…"
              className="w-full bg-slate-950 neu-pressed-sm rounded-xl px-3 py-2.5 text-slate-200 outline-none focus:border-emerald-500 resize-none" />
          </label>
        )}

        <div className="flex flex-col sm:flex-row gap-2">
          <button type="button" onClick={() => regenerate("random")} disabled={planBusy !== ""}
            className="flex-1 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 px-4 py-2.5 rounded-xl font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-all">
            {planBusy === "random" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shuffle className="w-4 h-4" />}
            {planBusy === "random" ? "Đang lên thực đơn…" : (weekPlan ? "Đổi thực đơn" : "Tạo thực đơn")}
          </button>
          {aiEnabled && (
            <button type="button" onClick={() => regenerate("ai")} disabled={planBusy !== ""}
              className="flex-1 bg-violet-500 hover:bg-violet-400 disabled:opacity-50 text-slate-950 px-4 py-2.5 rounded-xl font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-all">
              {planBusy === "ai" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {planBusy === "ai" ? "Đang nghĩ thực đơn…" : "Tạo bằng AI"}
            </button>
          )}
        </div>

        {planError && (
          <p className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl font-medium">{planError}</p>
        )}

        {weekPlan && weekPlan.days?.length ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${weekPlan.source === "ai" ? "bg-violet-500/10 border-violet-500/20 text-violet-300" : weekPlan.source === "random" ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300" : "bg-slate-800 border-slate-700 text-slate-300"}`}>
                {weekPlan.source === "ai" ? "✨ AI" : weekPlan.source === "random" ? "🎲 Ngẫu nhiên" : "Mẫu cân bằng"}
              </span>
              <span className="text-slate-500">{weekPlan.days.length} ngày · {weekPlan.adults} người lớn, {weekPlan.children} trẻ em</span>
              {weekPlan.source === "ai" && aiLearned !== null && aiLearned > 0 && (
                <span className="text-[10px] text-violet-300/80">+{aiLearned} món mới đã lưu để xoay vòng</span>
              )}
            </div>

            <MealTable days={weekPlan.days} />

            {/* Danh sách nguyên liệu gộp — tick chọn rồi thêm vào giỏ */}
            <div className="space-y-2">
              <p className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">Nguyên liệu cần mua ({selectedCount}/{weekPlan.groceries.length})</p>
              {groceryByCat.map(group => (
                <div key={group.cat} className="space-y-1">
                  <p className="text-[10px] font-bold text-slate-500 uppercase">{group.cat}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {group.items.map(g => {
                      const checked = !excluded.has(g.name);
                      const note = groceryNote(g);
                      return (
                        <button
                          key={g.name}
                          type="button"
                          onClick={() => toggleGrocery(g.name)}
                          className={`flex items-start gap-2 p-2 rounded-lg border text-left transition-all cursor-pointer ${checked ? "bg-slate-950 border-slate-700" : "bg-slate-950/40 border-slate-850 opacity-50"}`}
                        >
                          {checked ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" /> : <Circle className="w-4 h-4 text-slate-600 shrink-0 mt-0.5" />}
                          <span className="flex-1 min-w-0">
                            <span className="flex items-center gap-2">
                              <span className="text-slate-200 truncate flex-1">{g.name}</span>
                              <span className="text-slate-500 font-mono text-[10px] shrink-0">{g.quantity}</span>
                            </span>
                            {note && <span className="block text-[10px] text-slate-500 leading-snug mt-0.5">{note}</span>}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Thêm vào giỏ */}
            <div className="flex flex-col sm:flex-row items-center gap-2 pt-1">
              {addedCount !== null && (
                <span className="text-[11px] text-emerald-400 flex items-center gap-1 mr-auto">
                  <CheckCircle2 className="w-3.5 h-3.5" /> {addedCount > 0 ? `Đã thêm ${addedCount} món vào đi chợ` : "Các món đã có sẵn trong danh sách"}
                </span>
              )}
              <button
                type="button"
                onClick={addSelectedToList}
                disabled={planBusy !== "" || selectedCount === 0}
                className="w-full sm:w-auto sm:ml-auto bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 px-4 py-2.5 rounded-xl font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-all"
              >
                {planBusy === "add" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Thêm {selectedCount} món vào giỏ
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-slate-950/40 border border-dashed border-slate-800 rounded-xl py-6 text-center">
            <p className="text-sm text-slate-500">Chưa có thực đơn tuần. Bấm <span className="text-emerald-400 font-semibold">"Tạo thực đơn"</span> để bốc ngẫu nhiên từ thư viện món.</p>
          </div>
        )}
      </Reveal>

      {/* Pending items */}
      <Reveal delay={0.12} className="relative overflow-hidden bg-slate-900 neu-raised rounded-2xl p-5 space-y-3" id="shopping-pending">
        <ShimmerLine accent="emerald" />
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Cần mua ({pending.length})</h4>
            {pending.length > 0 && (
              <p className="text-[10px] text-slate-500 mt-0.5">Đã gom theo khu quầy — đi từng khu là mua đủ, khỏi chạy tới lui.</p>
            )}
          </div>
          {shoppingItems.length > 0 && (
            <button
              onClick={handleClearAll}
              className="text-[11px] text-slate-400 hover:text-rose-400 flex items-center gap-1 transition-colors cursor-pointer shrink-0"
              title="Xóa toàn bộ danh sách đi chợ"
            >
              <Trash2 className="w-3.5 h-3.5" /> Xóa tất cả
            </button>
          )}
        </div>
        {pending.length === 0 ? (
          <div className="bg-slate-950/40 border border-dashed border-slate-800 rounded-xl py-8 text-center">
            <p className="text-sm text-slate-500">Danh sách đi chợ đang trống. Thêm món cần mua ở trên nhé!</p>
          </div>
        ) : (
          <div className="space-y-4">
            {pendingByZone.map(group => {
              const meta = MARKET_ZONE_META[group.zone];
              return (
                <div key={group.zone} className="space-y-2">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold">
                    <span aria-hidden>{meta.emoji}</span>
                    <span className={`uppercase tracking-wider ${meta.accent}`}>{meta.label}</span>
                    <span className="text-slate-500 font-mono">({group.items.length})</span>
                    <span className="flex-1 h-px bg-slate-800 ml-1" />
                  </div>
                  <div className="space-y-2">
                    <AnimatePresence>{group.items.map(item => renderItem(item, false))}</AnimatePresence>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Reveal>

      {/* Purchased items */}
      {purchased.length > 0 && (
        <Reveal delay={0.18} className="relative overflow-hidden bg-slate-900 neu-raised rounded-2xl p-5 space-y-3" id="shopping-purchased">
          <ShimmerLine accent="sky" />
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Đã mua ({purchased.length})</h4>
            <button
              onClick={handleClearPurchased}
              className="text-[11px] text-slate-400 hover:text-rose-400 flex items-center gap-1 transition-colors cursor-pointer"
            >
              <Eraser className="w-3.5 h-3.5" /> Dọn các món đã mua
            </button>
          </div>
          <div className="space-y-2">
            <AnimatePresence>{purchased.map(item => renderItem(item, true))}</AnimatePresence>
          </div>
        </Reveal>
      )}

      {ConfirmDialog}
    </div>
  );
}
