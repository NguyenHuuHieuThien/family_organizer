# i18n Migration Guide — Family Organizer

> **Dành cho sub-agents làm song song.** Đọc toàn bộ phần I–III trước khi bắt đầu,
> rồi nhận assignment của mình ở Phần IV và thực thi theo đúng quy trình Phần V.

---

## I. Kiến trúc i18n

### Stack
- **react-i18next** + **i18next-browser-languagedetector**
- Config: [`src/i18n/index.ts`](index.ts)
- Locale files: `src/i18n/locales/{vi,en,zh}.json`
- Fallback: `vi` — key nào thiếu ở en/zh thì tự hiện tiếng Việt, **không bao giờ crash**
- Language key: localStorage `family_lang`

### Locale file — cấu trúc namespace
Tất cả 3 file (vi/en/zh) phải **đồng bộ cùng key**, chỉ khác value.
Namespace là prefix của key, ví dụ `"finance.addFab"`.

```
{
  "common":      { ... },   // Lưu/Hủy/Đóng/Xóa/Chỉnh sửa — dùng chung
  "language":    { ... },
  "theme":       { ... },
  "auth":        { ... },
  "nav":         { ... },
  "settings":    { ... },
  "categories":  { ... },   // Nhãn hạng mục chi — dùng Finance + Dashboard
  "accounts":    { ... },
  "finance":     { ... },   // ← CÒN THIẾU NHIỀU KEY
  "dashboard":   { ... },
  // Sắp thêm:
  "tasks":       { ... },
  "schedules":   { ... },
  "notes":       { ... },
  "shopping":    { ... },
  "documents":   { ... },
  "childHealth": { ... },
  "serverMonitor": { ... },
  "medication":  { ... }
}
```

---

## II. Patterns chuẩn

### 1. Hook trong component (phổ biến nhất)
```tsx
import { useTranslation } from "react-i18next";

function MyComponent() {
  const { t, i18n } = useTranslation();   // i18n chỉ cần khi gọi changeLanguage hoặc lấy i18n.language

  return <h1>{t("tasks.title")}</h1>;
}
```

### 2. Hàm module-level (KHÔNG dùng hook)
```tsx
import i18n from "../i18n/index.js";

// ✅ Đúng — gọi i18n.t() trực tiếp
function translateCategory(cat: string) {
  return i18n.t(`categories.${cat}`, { defaultValue: cat });
}

// ❌ Sai — hook không được gọi ngoài component
const { t } = useTranslation(); // lỗi ở module level
```

### 3. Nội suy biến
```json
// vi.json
"timeAgoMin": "{{n}} phút trước"
```
```tsx
t("dashboard.timeAgoMin", { n: 5 })   // → "5 phút trước"
```

### 4. Mảng (returnObjects)
```json
"greetings": ["Câu 1", "Câu 2"]
```
```tsx
const arr = t("dashboard.greetings", { returnObjects: true }) as string[];
```

### 5. useMemo phụ thuộc ngôn ngữ
```tsx
const { i18n } = useTranslation();

const labels = useMemo(() => ({
  title: t("tasks.title"),
}), [i18n.language]);  // ← PHẢI có i18n.language trong deps
```

### 6. Options array (FancySelect, dropdown, filter)
```tsx
// Trước
const OPTIONS = [
  { value: "all", label: "Tất cả" },
  { value: "income", label: "Thu nhập" },
];

// Sau — tạo trong component body hoặc useMemo:
const OPTIONS = useMemo(() => [
  { value: "all",    label: t("finance.filterAll") },
  { value: "income", label: t("finance.filterIncome") },
], [i18n.language]);
```

### 7. Confirm dialog
```tsx
useConfirm({
  title: t("finance.deleteTitle"),
  message: t("finance.deleteMsg"),
  confirmLabel: t("finance.deleteConfirm"),
});
```

### 8. Placeholder / aria-label
```tsx
<input placeholder={t("tasks.searchPlaceholder")} />
<button aria-label={t("finance.addMoneyOp")} />
```

---

## III. Tham chiếu đã hoàn thành

Xem các component sau làm ví dụ thực tế:

| File | Điểm đáng học |
|---|---|
| `src/components/Dashboard.tsx` | Module-level `i18n.t()`, `useMemo` với `i18n.language`, `returnObjects`, weather codes |
| `src/components/Auth.tsx` | Hook cơ bản, toàn bộ form |
| `src/components/Finance.tsx` (batch 1) | `translateCategory`, `translateAccount`, tabs, KPI cards — dòng 1–580 đã migrate |

**Locale mẫu:** [`locales/vi.json`](locales/vi.json) — bản gốc/nguồn sự thật. Mọi key mới phải vào vi.json trước, sau đó en.json và zh.json.

---

## IV. Assignment cho từng Sub-agent

Mỗi sub-agent nhận **một task** bên dưới. Không được đụng file của nhau để tránh conflict.

---

### 🅰 Finance — Batch 2 (arrays + helpers + validation)
**File:** `src/components/Finance.tsx`  
**Locale keys — thêm vào `"finance": { ... }`** trong cả 3 file JSON:

```json
{
  "finance": {
    // ... keys đã có ...
    "addFab": "Thêm khoản thu chi nhanh",
    "chartAriaLabel": "Biểu đồ thu chi 12 tháng",
    "trendTitle": "Xu hướng 12 tháng",
    "billFreqWeekly": "Hàng tuần",
    "billFreqMonthly": "Hàng tháng",
    "billFreqYearly": "Hàng năm",
    "dueWeek": "Trả tuần này",
    "dueMonth": "Trả tháng này",
    "dueYear": "Trả năm này",
    "addMoneyPlus": "Cộng thêm một khoản",
    "addMoneyMul": "Nhân số lượng",
    "errImageProcess": "Không xử lý được ảnh hóa đơn.",
    "errAmountZero": "Số tiền phải lớn hơn 0đ!",
    "errDescRequired": "Vui lòng nhập nội dung chi tiêu!",
    "errSaveTx": "Không thể lưu giao dịch này",
    "errBudgetZero": "Hạn mức phải lớn hơn 0",
    "errSaveBudget": "Không lưu được ngân sách",
    "errBillInvalid": "Nhập tên hóa đơn và số tiền hợp lệ",
    "errSaveBill": "Không lưu được hóa đơn",
    "errEditInvalid": "Nhập tên và số tiền hợp lệ",
    "errSaveEdit": "Không thể lưu thay đổi",
    "csvCol1": "Ngày", "csvCol2": "Loại", "csvCol3": "Hạng mục",
    "csvCol4": "Ví", "csvCol5": "Số tiền", "csvCol6": "Nội dung", "csvCol7": "Người tạo",
    "csvErrPdf": "Xuất PDF thất bại"
  }
}
```

**INCOME_SUGGESTIONS** — thêm key `"finance.incomeSuggestions"` là **mảng** (giống `dashboard.greetings`):
```json
"incomeSuggestions": [
  "Lương tháng", "Tiền thưởng", "Freelance / Làm thêm",
  "Hoa hồng bán hàng", "Cổ tức", "Lợi nhuận cổ phần / Đầu tư",
  "Tiền bán đồ", "Tiền mượn / Vay", "Được cho / Biếu tặng"
]
```

**EXPENSE/BILL category options** — đã có trong `"categories": {...}`.  
Trong code: chuyển `EXPENSE_CATEGORY_OPTIONS` thành useMemo gọi `t("categories.${v}")` + emoji.  
Tương tự `BILL_CATEGORIES` → `translateBillCategory(v)` dùng `i18n.t("categories.${v}")`.

**Dòng cần sửa chính:**
- L67: `" tỷ"` — giữ nguyên (đơn vị tiền tệ vi)
- L118: `aria-label="Biểu đồ thu chi 12 tháng"` → `aria-label={t("finance.chartAriaLabel")}`
- L182-192: `BILL_CATEGORIES` array → `translateBillCategory` dùng `i18n.t`
- L199-211: `EXPENSE_CATEGORY_OPTIONS` → useMemo với `t()`
- L213-217: `BILL_FREQUENCY_OPTIONS` → useMemo với `t()`
- L317,322: aria-labels MoneyInput
- L339-347: `INCOME_SUGGESTIONS` → `t("finance.incomeSuggestions", { returnObjects: true }) as string[]`
- L365-367: `dueThisPeriod()` function
- L498: FAB title
- L585: CSV headers array
- L626-636: account labels trong CSV
- L644: console.error (không cần dịch, nhưng user-facing thì dịch)
- L716,743,747,773,781,788,811,827,846,860: setFormError / setBudgetError / setBillError / setEditError

---

### 🅱 Finance — Batch 3 (UI sections: budget, bills, comparison, filters, list)
**File:** `src/components/Finance.tsx`  
**Locale keys — thêm vào `"finance": { ... }`**:

```json
{
  "finance": {
    "compareTitle": "So sánh: {{a}} ↔ {{b}}",
    "compareColCat": "Hạng mục",
    "compareColDiff": "Chênh lệch",
    "compareTotalIncome": "Tổng thu",
    "compareTotalExpense": "Tổng chi",
    "compareBalance": "Cân đối",
    "catBreakdownTitle": "Phân hóa hạng mục tiêu dùng",
    "donutTitle": "Cán cân Thu/Chi",
    "donutBalance": "Số dư",
    "donutSavings": "Tiết kiệm {{pct}}%",
    "budgetTitle": "Ngân sách tháng này",
    "budgetAdd": "Thêm hạn mức",
    "budgetEmpty": "Chưa thiết lập ngân sách.",
    "budgetCarryForward": "Sao chép kỳ trước",
    "budgetPlaceholderLimit": "Hạn mức",
    "budgetEditPlaceholder": "Hạn mức mới",
    "budgetEditTitle": "Sửa hạn mức",
    "budgetDeleteTitle": "Xóa hạn mức",
    "billTitle": "Hóa đơn định kỳ",
    "billAdd": "Thêm hóa đơn",
    "billEmpty": "Chưa có hóa đơn định kỳ.",
    "billNamePlaceholder": "Tên hóa đơn",
    "billAmountPlaceholder": "Số tiền",
    "billFreqAriaLabel": "Tần suất hóa đơn",
    "billCatAriaLabel": "Hạng mục hóa đơn",
    "billDeleteTitle": "Xóa hóa đơn định kỳ?",
    "billDeleteMsg": "Hóa đơn này sẽ bị xóa vĩnh viễn.",
    "billDeleteConfirm": "Xóa hóa đơn",
    "filterSearch": "Tìm miêu tả khoản chi, mua đồ đạc gia đình...",
    "filterTypeAll": "Khoản thu & chi",
    "filterTypeIncome": "Chỉ khoản Thu nhập (+)",
    "filterTypeExpense": "Chỉ khoản Chi tiêu (-)",
    "filterTypeLabel": "Lọc theo loại quỹ",
    "filterCatAll": "Mọi hạng mục",
    "filterCatLabel": "Lọc theo hạng mục",
    "filterAccountAll": "Mọi ví tài khoản",
    "filterAccountLabel": "Lọc theo ví tài khoản",
    "filterMemberAll": "Cả gia đình",
    "filterMemberLabel": "Lọc theo thành viên",
    "listEmpty": "Không có giao dịch nào trong <b>{{period}}</b> khớp bộ lọc.",
    "exportCsvTitle": "Xuất danh sách đang lọc ra file CSV (Excel)",
    "exportPdfTitle": "Xuất báo cáo PDF của kỳ đang xem",
    "exportCsv": "Xuất CSV",
    "exportPdf": "Xuất PDF",
    "exportingPdf": "Đang xuất...",
    "assetSale": "Bán tài sản"
  }
}
```

**Dòng cần sửa chính:**
- L1157-1159: comparison summary rows
- L1218, 1224, 1261, 1264, 1275: budget ariaLabel, placeholder, title buttons
- L1322-1334: bill form inputs + ariaLabels
- L1371-1373: delete bill confirm
- L1528, 1543-1588: filter inputs
- L1599: empty state
- L1611-1622: export buttons
- L1686: asset sale badge

---

### 🅲 Finance — Batch 4 (transaction form + confirm + receipt)
**File:** `src/components/Finance.tsx`  
**Locale keys — thêm vào `"finance": { ... }`**:

```json
{
  "finance": {
    "formIncomeTab": "Thu nhập",
    "formExpenseTab": "Chi tiêu",
    "formDescLabel": "Nội dung ghi chép",
    "formDescRequired": "(*)",
    "formDescPlaceholderExpense": "Ví dụ: Đi chợ mua cá lóc, thanh toán hóa đơn điện nước...",
    "formDescPlaceholderIncome": "Ví dụ: Nhận thưởng hoàn thành dự án, nhận lương tháng...",
    "formAmountLabel": "Số tiền",
    "formAmountPlaceholder": "Điền số giá trị...",
    "formCatExpense": "Hạng mục chi phí",
    "formCatIncome": "Hạng mục nguồn tiền",
    "formCatAriaExpense": "Hạng mục chi phí",
    "formCatAriaIncome": "Nguồn thu",
    "formCatOther": "Khác (tự nhập)…",
    "formCatOtherPlaceholder": "Nhập nguồn thu khác: trúng số, tiền lì xì...",
    "formAccountAria": "Hình thức giao dịch",
    "formAccountBank": "Tài khoản Ngân hàng 💳",
    "formAccountCash": "Tiền mặt thủ công 💵",
    "formAccountEWallet": "Ví điện tử MoMo/ZaloPay 📱",
    "formSave": "Lưu giao dịch",
    "formSaveEdit": "Lưu thay đổi",
    "deleteTxTitle": "Xóa bản ghi chi tiêu?",
    "deleteTxMsg": "Bản ghi tài chính này sẽ bị xóa vĩnh viễn khỏi sổ quỹ gia đình. Bạn có chắc chắn muốn tiếp tục không?",
    "deleteTxConfirm": "Xóa bản ghi",
    "receiptAriaLabel": "Xem hóa đơn",
    "receiptAlt": "Hóa đơn thanh toán",
    "txViewReceipt": "Xem ảnh hóa đơn",
    "txEdit": "Sửa giao dịch này",
    "txDelete": "Xóa giao dịch này",
    "editBillNamePlaceholder": "Tên hóa đơn",
    "editBillAmountPlaceholder": "Số tiền",
    "editBillFreqAria": "Tần suất hóa đơn",
    "editBillCatAria": "Hạng mục hóa đơn"
  }
}
```

**Dòng cần sửa chính:**
- L1789: tab buttons Thu/Chi
- L1798-1801: formDescLabel, placeholder
- L1819: formAmountPlaceholder
- L1838-1860: category sections (expense/income)
- L1876-1880: account dropdown
- L1926: submit button
- L1941: receipt dialog
- L1944: receipt img alt
- L1700, 1719, 1726: icon button titles
- L1975, 1983, 1994, 2000: edit bill form
- L866-868: delete confirm

---

### 🅳 Tasks.tsx — Full migration
**File:** `src/components/Tasks.tsx`  
**Namespace mới:** `"tasks"` — thêm vào cả 3 locale files

Scan toàn bộ file, tìm chuỗi tiếng Việt (có chữ `Ā-￿`), map thành keys dưới `"tasks": {}`.

Gợi ý key pattern:
```json
{
  "tasks": {
    "title": "Nhóm Task",
    "addTask": "Thêm task",
    "editTask": "Sửa task",
    "deleteTask": "Xóa task",
    "complete": "Hoàn thành",
    "reopen": "Mở lại",
    ...
  }
}
```

Dịch sang **en** và **zh** tương ứng.

---

### 🅴 Schedules.tsx — Full migration
**File:** `src/components/Schedules.tsx`  
**Namespace mới:** `"schedules"`

Gợi ý key pattern:
```json
{
  "schedules": {
    "title": "Lập Lịch",
    ...
  }
}
```

---

### 🅵 Notes.tsx — Full migration
**File:** `src/components/Notes.tsx`  
**Namespace mới:** `"notes"`

Lưu ý: Markdown rendering đã hoàn thành (không cần sửa). Chỉ migrate chuỗi UI.

---

### 🅶 Shopping.tsx — Full migration
**File:** `src/components/Shopping.tsx`  
**Namespace mới:** `"shopping"`

---

### 🅷 Documents.tsx — Full migration
**File:** `src/components/Documents.tsx`  
**Namespace mới:** `"documents"`

---

### 🅸 ChildHealth.tsx — Full migration
**File:** `src/components/ChildHealth.tsx`  
**Namespace mới:** `"childHealth"`

---

### 🅹 Medication.tsx — Full migration
**File:** `src/components/Medication.tsx`  
**Namespace mới:** `"medication"`

---

### 🅺 ServerMonitor.tsx — Full migration
**File:** `src/components/ServerMonitor.tsx`  
**Namespace mới:** `"serverMonitor"`

---

### 🅻 Shared components (ConfirmDialog, GlobalSearch, QuickNudge)
**Files:** `ConfirmDialog.tsx`, `GlobalSearch.tsx`, `QuickNudge.tsx`  
**Keys:** thêm vào `"common"` hoặc namespace riêng `"search"`, `"nudge"`.

**ConfirmDialog.tsx** — dịch default text (cancel/confirm buttons):
```json
{
  "common": {
    "confirmDefault": "Xác nhận",
    "cancelDefault": "Hủy"
  }
}
```

---

## V. Quy trình cho mỗi Sub-agent

```
1. Đọc file component được giao (Read tool)
2. Grep chuỗi tiếng Việt: pattern `"[^"]*[Ā-￿][^"]*"` 
3. Thiết kế keys trong namespace (snake_case hoặc camelCase nhất quán)
4. Cập nhật src/i18n/locales/vi.json (thêm keys vào đúng namespace)
5. Cập nhật src/i18n/locales/en.json (dịch sang tiếng Anh)
6. Cập nhật src/i18n/locales/zh.json (dịch sang tiếng Trung giản thể)
7. Sửa component: thêm import, const { t } = useTranslation(), thay strings bằng t()
8. Commit với message: "feat(i18n): migrate <ComponentName> to i18next"
```

### Checklist trước khi commit
- [ ] Không có chuỗi tiếng Việt cứng còn sót trong JSX/tsx
- [ ] Cả 3 locale files có cùng key set (không thiếu key ở en/zh)
- [ ] useMemo chứa label có `i18n.language` trong deps
- [ ] Module-level functions dùng `i18n.t()` không phải hook
- [ ] Không import trùng (đã có `useTranslation` ở trên thì không import lại)
- [ ] `import i18n from "../i18n/index.js"` chỉ khi CẦN (module-level function hoặc `i18n.language`)

### Import cần thêm vào đầu component
```tsx
import { useTranslation } from "react-i18next";
// Chỉ thêm dòng dưới nếu có module-level function cần t():
import i18n from "../i18n/index.js";
```

### Dòng đầu function component
```tsx
const { t, i18n } = useTranslation();
// hoặc nếu không cần i18n object:
const { t } = useTranslation();
```

---

## VI. Lưu ý đặc biệt

### Currency format
`toLocaleString("vi-VN")` — giữ nguyên cho số tiền (đây là format hiển thị tiền, không phải label).

### Emoji trong labels
Giữ emoji trong locale files:
```json
{ "walletCash": "Tiền mặt 💵" }
```
Không hardcode emoji trong tsx nếu label đi kèm emoji.

### PERIOD_LABELS và `periodLabel()` (utils/financePeriod.ts)
Có một số label kỳ xem ("Tháng", "Quý", "Năm", "Toàn bộ") trong `financePeriod.ts`.  
**Chưa migrate** — để nguyên cho batch sau hoặc Finance sub-agent xử lý riêng.

### Không dịch
- Tên riêng: "MoMo", "ZaloPay", "Bitcoin", "Tailscale"
- Đơn vị tiền tệ: "đ", "VND", "USD"
- Mã màu CSS, class names

### Chuỗi chỉ là console.log / dev warning
Không cần dịch `console.error(...)` — đây là debug log cho developer.
