# Design System: Family Organizer

> Nguồn chân lý (source of truth) về phong cách thiết kế cho **người** và **AI**.
> Mọi màn hình / component mới — dù do người viết hay do AI sinh ra — phải tuân theo
> tài liệu này để giao diện luôn nhất quán. Lấy cảm hứng từ quy ước
> [google-labs-code/design.md](https://github.com/google-labs-code/design.md):
> mô tả ngữ nghĩa (semantic) + giá trị chính xác.
>
> **Cách AI dùng tài liệu này:** đọc trước khi tạo UI mới; ưu tiên tái dùng các
> lớp Tailwind mẫu ở đây thay vì tự nghĩ ra giá trị mới; khi cần màu/khoảng cách
> mới, chọn theo thang đã định nghĩa bên dưới.

---

## 1. Visual Theme & Atmosphere

- **Tinh thần:** hiện đại, gọn (dense nhưng thoáng nhờ bo góc lớn), "premium app"
  hơn là "website". Cảm giác như một ứng dụng sức khỏe/tài chính cao cấp.
- **Mobile-first, PWA trên iPhone là môi trường chính** — luôn tôn trọng
  `env(safe-area-inset-*)` (notch & home indicator), nút nổi và thanh điều hướng
  phải né vùng an toàn. Ưu tiên thao tác chạm; nhiều chỗ "chạm để xem chi tiết".
- **Song chế độ Sáng/Tối** là bắt buộc. Cơ chế: **remap biến CSS** của thang
  `slate` và `sky` trong [src/index.css](src/index.css) — KHÔNG viết màu cứng cho
  bề mặt/chữ. Light = nền slate sáng + thẻ trắng; Dark = nền navy sâu + thẻ navy.
- **Chuyển động:** tinh tế, dùng `motion/react` (Framer Motion). Spring nhẹ cho
  xuất hiện/biến mất; **luôn tôn trọng `useReducedMotion()`** và cung cấp fallback
  mờ dần đơn giản.

---

## 2. Color Palette & Roles

### Màu theo theme (CHỈ dùng các bước đã remap — tự đổi theo Sáng/Tối)

| Token | Vai trò | Light | Dark |
|---|---|---|---|
| `slate-950` | Nền canvas chính | `#f8fafc` | `#0d121f` |
| `slate-900` | Nền thẻ/hộp (card) | `#ffffff` | `#131b2e` |
| `slate-850` | Viền mềm | Slate 200 | `#1e2942` |
| `slate-800` | Viền/hover/vùng phụ | Slate 100 | `#253352` |
| `slate-500` | Placeholder / info yếu | `#64748b` | `#8392a8` |
| `slate-450` | Chi tiết phụ trợ | `#475569` | `#9fb0c9` |
| `slate-400` | Chữ mô tả | `#334155` | `#aab8cc` |
| `slate-300` | Chữ phụ | `#334155` | `#cbd5e1` |
| `slate-200` | Chữ thân chính (body) | `#1e293b` | `#e2e8f0` |
| `slate-100` | Tiêu đề đậm | `#0f172a` | `#f8fafc` |

> ⚠️ **Tránh** `slate-50`, `slate-600/700`, `bg-white`, `gray-*`, đen/trắng cứng
> cho bề mặt & chữ — chúng KHÔNG đổi theo theme. Chỉ **10 bước slate trong bảng
> trên (100 → 950)** + toàn thang `sky` là theme-aware.
>
> 🕳️ **Bẫy hay gặp — `slate-50`:** KHÔNG được remap (chỉ có `slate-100` trở lên).
> `text-slate-50` = near-white cứng → **vô hình trên theme Sáng**. Cần chữ đậm/sáng
> nhất (tiêu đề to) → dùng **`text-slate-100`** (Sáng = gần đen, Tối = gần trắng).
>
> ✅ **Luôn tự nhẩm cả 2 theme khi chọn màu:** một màu chữ/nền phải đọc được trên
> **cả** nền Sáng (thẻ trắng) **và** nền Tối (thẻ navy). Nếu chỉ hợp một bên → sai.

### Màu thương hiệu (Indigo) — qua thang `sky` đã remap

Hành động chính / điểm nhấn thương hiệu = **Indigo rực** (`sky-500` ≈ `#4f46e5`
light / `#6366f1` dark). Dùng `sky-*` cho các điểm nhấn cần đổi theo theme.

### Màu nhấn cố định (KHÔNG đổi theo theme — dùng có chủ đích)

| Màu | Ý nghĩa ngữ nghĩa | Cách dùng điển hình |
|---|---|---|
| **Indigo** | Hành động chính, trung tính tin cậy | nút submit, focus viền input, icon tiêu đề |
| **Emerald** | Tích cực / tiền vào / "thêm mới" | FAB thêm, badge "còn hạn", số dương |
| **Rose** | Nguy hiểm / xóa / quá hạn / tiền ra | nút xóa, dialog danger, badge "hết hạn" |
| **Amber** | Cảnh báo / sắp đến hạn | badge "sắp hết hạn", nhắc nhở |
| **Sky** | Thông tin / "chia sẻ" | badge chia sẻ, thông tin trung lập |

**Quy ước tint:** nền `color-500/10` → `color-500/15`, chữ `color-400`,
viền `color-500/20` → `color-500/30`. Ví dụ badge:
`bg-emerald-500/10 text-emerald-400 border border-emerald-500/20`.

---

## 3. Typography Rules

- **Sans (mặc định):** `Inter` — weight 400/500/600/700/800.
- **Mono:** `JetBrains Mono` — dùng cho **số liệu, ngày tháng, mã/ID** (`font-mono`)
  để các con số thẳng hàng, dễ đọc. Cân nhắc `tabular-nums` cho số đếm.
- **Thang cỡ chữ thực tế trong app (đa số nhỏ, gọn):**
  - Tiêu đề khối/section: `text-sm font-bold text-slate-200` (kèm icon nhấn).
  - Tiêu đề thẻ/mục: `text-sm font-bold text-slate-100`.
  - Thân/mô tả: `text-xs` hoặc `text-[11px]` màu `text-slate-400`.
  - Phụ chú/badge/meta: `text-[10px]` màu `text-slate-500`.
- **iOS zoom:** input/select/textarea ép `font-size: 16px` ở màn ≤640px để Safari
  không auto-zoom khi focus — đã xử lý global trong CSS, **không hạ cỡ chữ control
  xuống dưới 16px trên mobile**.

---

## 4. Component Stylings

### Neumorphism (hiệu ứng nổi/lõm) — nền tảng bề mặt

Giao diện dùng phong cách **Neumorphism**: bề mặt cùng gam với canvas, phân biệt
nhau bằng **bóng KÉP** (sáng trên-trái + tối dưới-phải). Cặp màu bóng
`--neu-hi`/`--neu-lo` đã remap theo Sáng/Tối trong [src/index.css](src/index.css)
— **không viết bóng cứng**, dùng các lớp tiện ích sau:

| Lớp | Dùng cho |
| --- | --- |
| `.neu-raised` / `.neu-raised-sm` / `.neu-raised-lg` | thẻ/khối **nổi** khỏi nền |
| `.neu-flat` | nổi rất nhẹ (badge, chip, ô phụ) |
| `.neu-pressed` / `.neu-pressed-sm` | vùng **lõm** (ô nhập, thanh trạng thái, track) |
| `.neu-btn` | nút bấm: nổi → **lõm khi `:active`** (kèm hover nhấn nhẹ) |
| `.neu-btn-active` | nút đang chọn (nav/tab active) — giữ lõm cố định |
| `.neu-card` | thẻ hoàn chỉnh = nền `slate-900` + `rounded-[1.25rem]` + bóng nổi |

- **CHỈ dùng cho bề mặt NẰM TRÊN canvas** (thẻ, nút, ô nhập trong luồng trang).
  **KHÔNG** dùng cho phần tử nổi trên lớp phủ (modal / dropdown / toast): nền ở đó
  không đồng màu nên bóng kép trông sai → giữ `shadow-2xl` mặc định.
- Neumorphism **kỵ viền cứng**: khi thêm `.neu-*` cho khối, bỏ `border border-slate-*`
  (viền chọi với bóng, mất cảm giác đùn). Cần ngăn cách thì dùng bóng, không dùng viền.
- Bo góc mềm hơn phong cách phẳng: thẻ `rounded-2xl`/`rounded-[1.25rem]`.

### Buttons
- **Hành động chính:** `bg-indigo-500 hover:bg-indigo-400 text-white rounded-xl
  px-4 py-2.5 font-bold flex items-center justify-center gap-1.5 cursor-pointer`,
  thường mở đầu bằng icon (vd `<Plus className="w-4 h-4" />`).
- **Phụ/Hủy:** `bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl px-4 py-2.5 font-bold`.
- **Icon nhỏ (sửa/xóa trong thẻ):** `p-1.5 bg-slate-950 neu-btn rounded-lg
  text-slate-500`, hover đổi sang accent (`hover:text-amber-400` cho sửa,
  `hover:text-rose-400` cho xóa). Luôn kèm `title`/`aria-label`. **Không viền cứng** —
  `.neu-btn` tự nổi và lõm khi nhấn.
- Trạng thái disabled: `disabled:opacity-60`. Luôn `cursor-pointer` khi bấm được.

### Cards / Containers
- **Khối chuẩn (neumorphism):** `bg-slate-900 neu-raised rounded-2xl p-5 space-y-4`
  — KHÔNG `border` + KHÔNG `shadow-*` (dùng `.neu-raised`; thẻ hero to dùng `.neu-raised-lg`).
- **Vùng con lõm bên trong:** `bg-slate-950/40 neu-pressed-sm rounded-xl p-3`
  (giếng lõm — hợp cho panel phụ, thanh segmented, khung chứa danh sách).
- Bo góc: **thẻ = `rounded-2xl`** (bo lớn, mềm), **control/nút = `rounded-xl`**,
  **badge/icon-button = `rounded-lg`**, **chip tròn/FAB/avatar = `rounded-full`**.

### Inputs / Forms
- **Chuẩn (ô lõm):** `bg-slate-950 neu-pressed-sm rounded-xl px-3 py-2.5 text-slate-200
  outline-none focus:border-indigo-500` — ô nhập là giếng lõm; `focus:border-*` thêm
  viền màu khi focus. KHÔNG dùng `border border-slate-800` cho ô nhập nữa.
- **Dropdown chọn 1 giá trị: DÙNG `<FancySelect>`** ([src/components/FancySelect.tsx](src/components/FancySelect.tsx)),
  **không dùng `<select>` gốc** — list bung ra của `<select>` không tạo kiểu được,
  nhìn thô trên web. FancySelect: `options={[{value,label}]}`, popup portal +
  `position: fixed` (không bị thẻ cha `overflow-hidden` cắt), theme-aware, có bàn
  phím + đóng khi cuộn nền. Trigger mặc định `w-full` → cần bề ngang tuỳ ý thì bọc
  `<div className="w-…">`. Ngoại lệ hợp lệ: control cần type-ahead danh sách dài
  (vd giờ/phút trong `DateTimePicker24`) vẫn dùng `<select>` gốc.
- `<input type="date">` thêm
  `min-w-0 box-border appearance-none ... font-mono` để khít cột trên mobile.
- Form nhiều cột: grid `grid-cols-1 md:grid-cols-6 gap-2 text-xs`, dùng
  `md:col-span-*` để chia. Mobile xếp 1 cột.
- Báo lỗi: `text-[11px] text-rose-400`.

### Badges / Chips
- `text-[10px] px-2 py-0.5 rounded-lg border font-semibold` + bộ tint theo ngữ
  nghĩa màu (xem mục 2). Có icon nhỏ `w-3 h-3` khi cần.

### Modals / Dialogs
- Lớp phủ: `fixed inset-0 bg-slate-950/80 backdrop-blur-xs flex items-center
  justify-center z-50 p-4` (dialog xác nhận / nổi cao dùng `z-[60]`).
- Hộp thoại: `bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-5
  shadow-2xl`, vào bằng `motion` scale 0.95→1.
- **Bắt buộc dùng `useModalA11y`** ([src/hooks/useModalA11y.ts](src/hooks/useModalA11y.ts)):
  Esc để đóng, khóa cuộn nền, bẫy focus. Bấm nền để đóng, `stopPropagation` trên hộp.
- **Xác nhận hành động:** dùng hook `useConfirm`
  ([src/components/ConfirmDialog.tsx](src/components/ConfirmDialog.tsx)) thay cho
  `window.confirm`/`alert` native. Hành động xóa → `tone: "danger"`.
- **Xem ảnh:** mở lightbox trong app (xem mẫu trong
  [src/components/Documents.tsx](src/components/Documents.tsx) /
  [src/components/Assets.tsx](src/components/Assets.tsx)) thay vì mở tab mới.

### Floating Action Button (FAB)
- Một FAB duy nhất ở gốc app qua `useTabFab`
  ([src/components/FabHost.tsx](src/components/FabHost.tsx)) — mỗi tab đăng ký nút
  thêm-nhanh của mình; **không tự đặt FAB rời trong từng component**.
- Style: `fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-5 z-30
  rounded-full w-12 h-12 shadow-2xl text-slate-950`, màu `emerald | sky | rose`.
- Icon FAB nên trùng icon nav của tab để nhận diện nhanh.

### Navigation (sidebar / drawer)
- Điều hướng chính là **danh sách dọc** (`<nav className="space-y-1 text-xs">`),
  hiển thị sidebar trên desktop và drawer trên mobile — **không phải tab bar dưới**.
- Mục đang chọn: `bg-sky-500 text-slate-950 shadow-md shadow-sky-500/5`.
- Mục thường: `text-slate-400 hover:text-slate-200 hover:bg-slate-800/40`.
- Mỗi mục: `w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-bold
  transition-all` kèm icon `w-4.5 h-4.5`.

### Avatars
- Dùng component [src/components/Avatar.tsx](src/components/Avatar.tsx).
- Avatar **bo `rounded-xl`** (không tròn hoàn toàn cho avatar người dùng ở sidebar).

### Icons
- Bộ icon: **`lucide-react`**. Cỡ phổ biến: `w-3 h-3` (badge), `w-3.5 h-3.5`
  (icon-button), `w-4/w-5 h-*` (tiêu đề/nút). Tô màu theo ngữ nghĩa accent.

---

## 4b. Lively — bộ hiệu ứng "lung linh" dùng chung

Mọi tab dùng chung các primitive trong
[src/components/Lively.tsx](src/components/Lively.tsx) — **không tự chế lại**:

- **`<ShimmerLine accent="sky" />`** — đường gradient mảnh 1px ôm mép trên thẻ.
  Thẻ cha cần `relative overflow-hidden`. Chọn accent theo ngữ nghĩa của khối
  (emerald=tiền/thêm, rose=thuốc/nguy hiểm, amber=lịch/vàng, pink=sức khỏe/sinh nhật,
  sky/indigo=trung tính, violet=AI). Có thể truyền `via="via-emerald-500/50"` khi cần động.
- **`<IconChip accent="amber"><Calendar className="w-4 h-4" /></IconChip>`** —
  icon tiêu đề section nằm trong chip gradient có ring; dùng cạnh chữ
  `text-sm font-bold text-slate-200`. Icon trong chip luôn `w-4 h-4`.
- **`<Reveal delay={0.06}>`** — khối trượt vào khi mount (spring), fade khi
  `useReducedMotion`. Stagger giữa các khối lớn bằng bước ~0.06s; danh sách dài dùng
  `staggerDelay(i)` (mặc định 0.05s/mục, chặn trần ở mục thứ 8). Nhận `as`, `id`,
  `onClick`, `hoverLift`.
- **Hover-lift:** phần tử do motion điều khiển transform (Reveal, motion.div có
  initial/animate y) **KHÔNG dùng CSS `hover:-translate-y`** — inline transform của
  motion đè class. Dùng `hoverLift` của Reveal hoặc `whileHover={{ y: -3 }}`.
  Cũng **không dùng `transition-all`** trên các phần tử đó (CSS transition đánh nhau
  với motion) — chỉ transition thuộc tính cụ thể:
  `transition-[box-shadow,border-color] duration-300`.
  Phần tử tĩnh (không motion) vẫn dùng CSS hover bình thường.
- **Quầng glow góc thẻ (tùy chọn, thẻ stat):**
  `absolute -top-8 -right-8 w-24 h-24 rounded-full bg-{accent}-500/10 blur-2xl` +
  `group-hover:bg-{accent}-500/20`.
- **Hero Tổng quan:** banner aurora đổi bảng màu theo buổi (sáng/chiều/tối) — cấu
  hình trong `AURORA` ở [src/components/Dashboard.tsx](src/components/Dashboard.tsx):
  3 blob `blur-3xl` trôi chậm + sparkle ✦; tên người dùng chữ gradient
  `bg-clip-text text-transparent`. Blob dùng accent cố định ở /15–/25 để đẹp cả 2 theme.
- Mọi animation đều phải có fallback `useReducedMotion` (Lively đã tự xử lý).

---

## 5. States & Feedback

- **Loading (toàn trang / hành động lớn):** vòng xoay
  `w-12 h-12 border-4 border-slate-800 border-t-sky-500 rounded-full animate-spin`,
  kèm chú thích `text-xs font-mono tracking-widest uppercase text-slate-400`.
- **Loading nút bấm:** đổi nhãn nút (vd "Đang lưu...") + `disabled:opacity-60`,
  KHÔNG dùng spinner rời. Theo pattern `saving`/`uploading`/`loadingAction` state.
- **Empty state:** `bg-slate-900/40 border border-dashed border-slate-800
  rounded-2xl py-12 text-center` + dòng gợi ý `text-sm text-slate-500`.
- **Phản hồi lỗi/thành công: INLINE, không có toast system.** Lỗi hiện ngay tại
  form `text-[11px] text-rose-400`. **Đừng thêm thư viện toast** — giữ phản hồi
  cạnh hành động (inline text, đổi nhãn nút, badge).
- **Trạng thái "sống"/online:** `animate-pulse` trên icon (vd `Wifi` emerald).
- **Badge đếm (thông báo):** chấm `bg-rose-500 text-slate-950 rounded-full
  text-[8px] font-extrabold` viền `border-slate-950`, có `animate-pulse` khi mới.
- **Focus nhìn thấy được:** với phần tử tương tác tùy biến dùng
  `focus:outline-none focus:ring-2 focus:ring-sky-500/40`; input dùng
  `focus:border-indigo-500`.

---

## 6. Layout Principles

- **Khoảng cách dọc giữa khối:** `space-y-6`; trong thẻ `space-y-4`; chi tiết
  `space-y-1.5` / `space-y-1`.
- **Grid danh sách:** `grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4` cho
  thẻ; form nội bộ dùng grid 6 cột (mục 4).
- **Mobile-first:** thiết kế cho 1 cột trước, thêm breakpoint `md:`/`xl:` sau.
- **Safe-area:** mọi phần tử cố định đáy/đỉnh cộng `env(safe-area-inset-*)`.
- **Độ sâu:** phẳng nhẹ — thẻ `shadow-xl`, modal/FAB `shadow-2xl`, bóng màu cho
  FAB (`shadow-emerald-500/30`...). Không dùng bóng nặng tương phản cao.
- **Cuộn:** thanh cuộn mảnh 6px tuỳ biến theo theme (đã set global).

---

## Checklist nhanh cho AI khi tạo UI mới

- [ ] **Kiểm tra hiển thị ở CẢ theme Sáng & Tối** — bề mặt/chữ chỉ dùng bước `slate` theme-aware trong bảng (100→950); **không** `slate-50`/`gray-*`/`bg-white`/đen-trắng cứng (vô hình hoặc lệch trên một theme). Chữ sáng/đậm nhất = `text-slate-100`.
- [ ] Màu nhấn đúng ngữ nghĩa (emerald=tốt/thêm, rose=xóa/nguy hiểm, amber=cảnh báo, sky=thông tin, indigo=hành động chính).
- [ ] Thẻ `rounded-2xl`, control `rounded-xl`, badge `rounded-lg`.
- [ ] Số/ngày dùng `font-mono`; control mobile không < 16px.
- [ ] Modal dùng `useModalA11y`; xác nhận dùng `useConfirm`; ảnh mở lightbox.
- [ ] Thêm-nhanh qua `useTabFab`, không tự đặt FAB rời.
- [ ] Animation qua `motion/react` + fallback `useReducedMotion`.
- [ ] Cố định đáy/đỉnh phải cộng `env(safe-area-inset-*)`.
