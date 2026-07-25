/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Đa ngôn ngữ (i18n) theo chuẩn react-i18next — mỗi ngôn ngữ là 1 file JSON trong
// ./locales. Người đóng góp bản dịch chỉ cần copy vi.json, dịch giá trị và thêm mã
// ngôn ngữ vào SUPPORTED_LANGUAGES + resources bên dưới (không đụng tới UI).
//
// Thêm một ngôn ngữ mới:
//   1) Tạo src/i18n/locales/<mã>.json (copy từ vi.json, dịch phần value).
//   2) import ở đây và thêm vào `resources` + `SUPPORTED_LANGUAGES`.
//   3) Xong — bộ chọn ngôn ngữ trong Thiết lập → Hệ thống sẽ tự có lựa chọn mới.

import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import vi from "./locales/vi.json";
import en from "./locales/en.json";
import zh from "./locales/zh.json";

// Danh sách ngôn ngữ hỗ trợ — dùng chung cho bộ chọn trong Thiết lập.
export const SUPPORTED_LANGUAGES = [
  { code: "vi", label: "Tiếng Việt", flag: "🇻🇳" },
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "zh", label: "中文", flag: "🇨🇳" },
] as const;

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number]["code"];

// Khoá localStorage lưu ngôn ngữ đã chọn (đồng bộ tên đặt với family_theme).
export const LANG_STORAGE_KEY = "family_lang";

const resources = {
  vi: { translation: vi },
  en: { translation: en },
  zh: { translation: zh },
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: "vi", // thiếu key ở ngôn ngữ khác → hiển thị tiếng Việt (bản gốc)
    supportedLngs: SUPPORTED_LANGUAGES.map(l => l.code),
    nonExplicitSupportedLngs: true, // "en-US" → "en"
    detection: {
      order: ["localStorage", "navigator"],
      lookupLocalStorage: LANG_STORAGE_KEY,
      caches: ["localStorage"],
    },
    interpolation: { escapeValue: false }, // React đã tự chống XSS
    returnNull: false,
  });

export default i18n;
