/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState, useCallback, useRef } from "react";
import {
  Calendar,
  Car,
  Coins,
  FileText,
  Gem,
  HandCoins,
  Image as ImageIcon,
  Info,
  Landmark,
  LineChart,
  MapPin,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  TrendingDown,
  TrendingUp,
  Upload,
  User as UserIcon,
  Wallet,
  X
} from "lucide-react";
import { motion } from "motion/react";
import {
  AccountType,
  AssetPhoto,
  AssetType,
  FamilyAsset,
  FinancialTransaction,
  TransactionType,
  User,
  UserRole
} from "../types.js";
import { useConfirm } from "./ConfirmDialog.js";
import { optimizeImageFile } from "../utils/image.js";
import { uploadDataUrl } from "../utils/uploadImage.js";
import { useModalA11y } from "../hooks/useModalA11y.js";
import { useTabFab } from "./FabHost.js";
import { ShimmerLine, Reveal, staggerDelay } from "./Lively.js";
import { FancySelect } from "./FancySelect.js";
import { DateInputDMY } from "./DateTimePicker24.js";
import {
  GOLD_PURITY_OPTIONS,
  MarketPrices,
  effectiveGoldWeight,
  getEffectiveValue,
  goldPurityFactor,
  goldPurityLabel,
  isGoldType,
  normalizeGoldPurity
} from "../utils/assetValue.js";

interface AssetsProps {
  currentUser: User;
  users: User[];
  assets: FamilyAsset[];
  widgets?: any;
  onSaveAsset: (asset: Partial<FamilyAsset>) => Promise<any>;
  onDeleteAsset: (id: string) => Promise<any>;
  onSaveTransaction?: (tx: Partial<FinancialTransaction>) => Promise<any>;
}

// Hạng mục thu nhập dùng khi ghi nhận tiền bán tài sản vào sổ thu chi.
const ASSET_SALE_CATEGORY = "Bán tài sản";

const SELL_ACCOUNTS: { value: AccountType; label: string }[] = [
  { value: AccountType.BANK, label: "Ngân hàng 💳" },
  { value: AccountType.CASH, label: "Tiền mặt 💵" },
  { value: AccountType.E_WALLET, label: "Ví điện tử 📱" }
];

const ASSET_TYPES: { value: AssetType; label: string; short: string }[] = [
  { value: "crypto", label: "Tài sản mã hóa / crypto", short: "Crypto" },
  { value: "land", label: "Sổ đất / bất động sản", short: "Sổ đất" },
  { value: "gold_bar", label: "Vàng miếng", short: "Vàng miếng" },
  { value: "gold_ring", label: "Vàng nhẫn", short: "Vàng nhẫn" },
  { value: "gold_jewelry", label: "Vàng trang sức", short: "Trang sức" },
  { value: "gold_other", label: "Vàng loại khác", short: "Vàng khác" },
  { value: "vehicle", label: "Xe cộ", short: "Xe" },
  { value: "stock", label: "Cổ phần / cổ phiếu", short: "Cổ phiếu" },
  { value: "other", label: "Tài sản khác", short: "Khác" }
];

const MAX_ASSET_PHOTOS = 8;

function assetTypeLabel(type: AssetType) {
  return ASSET_TYPES.find(t => t.value === type)?.short || "Khác";
}

function defaultUnitForType(type: AssetType) {
  if (type === "crypto") return "coin";
  if (type === "land") return "m2";
  if (isGoldType(type)) return "chỉ";
  if (type === "vehicle") return "chiếc";
  if (type === "stock") return "cổ phiếu";
  return "món";
}

function typeClass(type: AssetType) {
  if (type === "crypto") return "text-sky-400 bg-sky-500/10 border-sky-500/20";
  if (type === "land") return "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
  if (isGoldType(type)) return "text-amber-400 bg-amber-500/10 border-amber-500/20";
  if (type === "vehicle") return "text-orange-400 bg-orange-500/10 border-orange-500/20";
  if (type === "stock") return "text-violet-400 bg-violet-500/10 border-violet-500/20";
  return "text-slate-400 bg-slate-800 border-slate-700";
}

function formatMoney(value: number, currency: "VND" | "USD" = "VND") {
  if (currency === "USD") return `${value.toLocaleString("en-US")} USD`;
  return `${value.toLocaleString("vi-VN")} VNĐ`;
}

function formatMoneyInput(n: number) {
  return n > 0 ? n.toLocaleString("vi-VN") : "";
}

function parseMoneyInput(value: string) {
  return Number(value.replace(/[^\d]/g, "")) || 0;
}


export function Assets({
  currentUser,
  users,
  assets,
  widgets,
  onSaveAsset,
  onDeleteAsset,
  onSaveTransaction
}: AssetsProps) {
  const { confirm, ConfirmDialog } = useConfirm();
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState<AssetType | "all">("all");
  const [ownerFilter, setOwnerFilter] = useState<string>("all");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<FamilyAsset | null>(null);
  const [selectedPhoto, setSelectedPhoto] = useState<{ asset: FamilyAsset; photo: AssetPhoto } | null>(null);
  const [formError, setFormError] = useState("");
  const [imageProcessing, setImageProcessing] = useState(false);
  const [showGoldPurityInfo, setShowGoldPurityInfo] = useState(false);

  // Bán tài sản — popup ghi nhận tiền bán vào sổ thu chi rồi xóa tài sản.
  const [sellingAsset, setSellingAsset] = useState<FamilyAsset | null>(null);
  const [sellMode, setSellMode] = useState<"estimate" | "custom">("estimate");
  const [sellPrice, setSellPrice] = useState<number>(0);
  const [sellEstimate, setSellEstimate] = useState<number>(0);
  const [sellAccount, setSellAccount] = useState<AccountType>(AccountType.BANK);
  const [sellDate, setSellDate] = useState(new Date().toISOString().slice(0, 10));
  const [sellNote, setSellNote] = useState("");
  const [sellError, setSellError] = useState("");
  const [selling, setSelling] = useState(false);

  const [formType, setFormType] = useState<AssetType>("gold_bar");
  const [formName, setFormName] = useState("");
  const [formOwnerId, setFormOwnerId] = useState("");
  const [formQuantity, setFormQuantity] = useState<number>(1);
  const [formUnit, setFormUnit] = useState(defaultUnitForType("gold_bar"));
  const [formEstimatedValue, setFormEstimatedValue] = useState<number>(0);
  const [formPurchaseValue, setFormPurchaseValue] = useState<number>(0);
  const [formCurrency, setFormCurrency] = useState<"VND" | "USD">("VND");
  const [formPurchaseDate, setFormPurchaseDate] = useState("");
  const [formLocation, setFormLocation] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formPhotos, setFormPhotos] = useState<AssetPhoto[]>([]);
  const [formSymbol, setFormSymbol] = useState("");
  const [formNetwork, setFormNetwork] = useState("");
  const [formWalletLabel, setFormWalletLabel] = useState("");
  const [formWalletAddressMasked, setFormWalletAddressMasked] = useState("");
  const [formAddress, setFormAddress] = useState("");
  const [formAreaM2, setFormAreaM2] = useState<number>(0);
  const [formCertificateNo, setFormCertificateNo] = useState("");
  const [formParcelNo, setFormParcelNo] = useState("");
  const [formGoldPurity, setFormGoldPurity] = useState("");
  const [formBrand, setFormBrand] = useState("");
  const [formSerialNo, setFormSerialNo] = useState("");

  const widgetsOverview = widgets ?? null;

  const marketPrices = useMemo<MarketPrices | null>(() => {
    const ov = widgetsOverview;
    if (!ov) return null;
    const usdVndRate: number = ov?.fx?.usdVnd ?? 25000;
    let gold: MarketPrices["gold"] = null;
    const g = ov?.gold;
    if (g) {
      const pricePerLuongVnd: number | null =
        g.sell ?? g.vndPerTael ??
        (g.usdPerOz ? Math.round((g.usdPerOz / 31.1035) * 37.5 * usdVndRate) : null);
      if (pricePerLuongVnd && pricePerLuongVnd > 0) {
        const pgVnd = pricePerLuongVnd / 37.5;
        const pgUsd = pgVnd / usdVndRate;
        gold = {
          pricePerGramVnd: pgVnd, pricePerGramUsd: pgUsd,
          pricePerChiVnd: pgVnd * 3.75, pricePerChiUsd: pgUsd * 3.75,
          pricePerLuongVnd, pricePerLuongUsd: pgUsd * 37.5,
          source: g.source ?? "vang.today"
        };
      }
    }
    const crypto: MarketPrices["crypto"] = {};
    const c = ov?.crypto;
    if (c?.bitcoin) crypto["BTC"] = { usd: c.bitcoin.usd ?? 0, vnd: c.bitcoin.vnd ?? (c.bitcoin.usd ?? 0) * usdVndRate };
    if (c?.ethereum) crypto["ETH"] = { usd: c.ethereum.usd ?? 0, vnd: c.ethereum.vnd ?? (c.ethereum.usd ?? 0) * usdVndRate };
    return { gold, crypto, usdVndRate, lastUpdated: new Date().toISOString() };
  }, [widgetsOverview]);

  const marketPricesStatus: "loading" | "ok" = widgetsOverview ? "ok" : "loading";

  // Live auto-value preview inside the form (recalculates as user types weight/quantity/symbol)
  const formAutoValue = useMemo(() => {
    if (!marketPrices) return null;
    // Với vàng, "Số lượng/Đơn vị" chính là trọng lượng/đơn vị vàng.
    if (isGoldType(formType) && formQuantity > 0) {
      const gold = marketPrices.gold;
      if (!gold) return null;
      const wu = formUnit.toLowerCase().trim();
      const isUsd = formCurrency === "USD";
      let ppu: number;
      if (wu === "lượng") ppu = isUsd ? gold.pricePerLuongUsd : gold.pricePerLuongVnd;
      else if (wu === "gram" || wu === "g") ppu = isUsd ? gold.pricePerGramUsd : gold.pricePerGramVnd;
      else ppu = isUsd ? gold.pricePerChiUsd : gold.pricePerChiVnd;
      const factor = goldPurityFactor(formGoldPurity);
      const v = Math.round(formQuantity * ppu * factor);
      const purityNote = factor < 1 ? ` × ${Math.round(factor * 100)}% tuổi vàng` : "";
      return v > 0 ? { value: v, label: `${formQuantity} ${formUnit} × giá 9999${purityNote}` } : null;
    }
    if (formType === "crypto" && formSymbol && formQuantity > 0) {
      const coin = marketPrices.crypto[formSymbol.toUpperCase()];
      if (!coin) return null;
      const price = formCurrency === "USD" ? coin.usd : coin.vnd;
      const v = Math.round(formQuantity * price);
      return v > 0 ? { value: v, label: `${formQuantity} ${formSymbol} × $${coin.usd.toLocaleString("en-US")}` } : null;
    }
    return null;
  }, [marketPrices, formType, formGoldPurity, formCurrency, formSymbol, formQuantity, formUnit]);

  const filteredAssets = useMemo(() => {
    const text = searchTerm.trim().toLowerCase();
    return assets.filter(asset => {
      if (typeFilter !== "all" && asset.type !== typeFilter) return false;
      if (ownerFilter !== "all" && (asset.ownerId || "") !== ownerFilter) return false;
      if (!text) return true;
      return [
        asset.name,
        asset.notes,
        asset.location,
        asset.symbol,
        asset.network,
        asset.address,
        asset.certificateNo,
        asset.brand,
        asset.serialNo
      ].some(value => String(value || "").toLowerCase().includes(text));
    }).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [assets, searchTerm, typeFilter, ownerFilter]);

  // Totals are kept per-currency — VND and USD must never be summed together.
  // Uses effective values: live market price → manual estimatedValue → purchaseValue fallback.
  const stats = useMemo(() => {
    const acc = {
      totalVnd: 0, totalUsd: 0,
      goldVnd: 0, goldUsd: 0,
      cryptoVnd: 0, cryptoUsd: 0,
      landVnd: 0, landUsd: 0
    };
    assets.forEach(asset => {
      const { value } = getEffectiveValue(asset, marketPrices);
      const usd = asset.currency === "USD";
      acc[usd ? "totalUsd" : "totalVnd"] += value;
      if (isGoldType(asset.type)) acc[usd ? "goldUsd" : "goldVnd"] += value;
      else if (asset.type === "crypto") acc[usd ? "cryptoUsd" : "cryptoVnd"] += value;
      else if (asset.type === "land") acc[usd ? "landUsd" : "landVnd"] += value;
    });
    return acc;
  }, [assets, marketPrices]);

  const resetForm = () => {
    setFormType("gold_bar");
    setFormName("");
    setFormOwnerId("");
    setFormQuantity(1);
    setFormUnit(defaultUnitForType("gold_bar"));
    setFormEstimatedValue(0);
    setFormPurchaseValue(0);
    setFormCurrency("VND");
    setFormPurchaseDate("");
    setFormLocation("");
    setFormNotes("");
    setFormPhotos([]);
    setFormSymbol("");
    setFormNetwork("");
    setFormWalletLabel("");
    setFormWalletAddressMasked("");
    setFormAddress("");
    setFormAreaM2(0);
    setFormCertificateNo("");
    setFormParcelNo("");
    setFormGoldPurity("");
    setFormBrand("");
    setFormSerialNo("");
  };

  const openCreateForm = () => {
    resetForm();
    setEditingAsset(null);
    setFormError("");
    setIsFormOpen(true);
  };

  const openEditForm = (asset: FamilyAsset) => {
    setEditingAsset(asset);
    setFormType(asset.type);
    setFormName(asset.name);
    setFormOwnerId(asset.ownerId || "");
    // Với vàng, gộp trọng lượng cũ (field weight) vào ô Số lượng/Đơn vị.
    if (isGoldType(asset.type)) {
      setFormQuantity(Number(asset.weight || asset.quantity || 1));
      setFormUnit(asset.weightUnit || asset.unit || "chỉ");
    } else {
      setFormQuantity(Number(asset.quantity || 1));
      setFormUnit(asset.unit || defaultUnitForType(asset.type));
    }
    setFormEstimatedValue(Number(asset.estimatedValue || 0));
    setFormPurchaseValue(Number(asset.purchaseValue || 0));
    setFormCurrency(asset.currency || "VND");
    setFormPurchaseDate(asset.purchaseDate || "");
    setFormLocation(asset.location || "");
    setFormNotes(asset.notes || "");
    setFormPhotos(asset.photos || []);
    setFormSymbol(asset.symbol || "");
    setFormNetwork(asset.network || "");
    setFormWalletLabel(asset.walletLabel || "");
    setFormWalletAddressMasked(asset.walletAddressMasked || "");
    setFormAddress(asset.address || "");
    setFormAreaM2(Number(asset.areaM2 || 0));
    setFormCertificateNo(asset.certificateNo || "");
    setFormParcelNo(asset.parcelNo || "");
    setFormGoldPurity(asset.goldPurity || "");
    setFormBrand(asset.brand || "");
    setFormSerialNo(asset.serialNo || "");
    setFormError("");
    setIsFormOpen(true);
  };

  const closeForm = useCallback(() => {
    if (imageProcessing) return;
    setIsFormOpen(false);
    setEditingAsset(null);
    setFormError("");
  }, [imageProcessing]);

  // Escape-to-close + scroll lock + focus trap for the form, photo viewer & gold-purity info
  const formRef = useRef<HTMLDivElement | null>(null);
  const photoRef = useRef<HTMLDivElement | null>(null);
  const goldInfoRef = useRef<HTMLDivElement | null>(null);
  const sellRef = useRef<HTMLDivElement | null>(null);
  const closePhoto = useCallback(() => setSelectedPhoto(null), []);
  const closeGoldInfo = useCallback(() => setShowGoldPurityInfo(false), []);
  const closeSell = useCallback(() => {
    if (selling) return;
    setSellingAsset(null);
    setSellError("");
  }, [selling]);
  useModalA11y(isFormOpen, closeForm, formRef);
  useModalA11y(!!selectedPhoto, closePhoto, photoRef);
  useModalA11y(showGoldPurityInfo, closeGoldInfo, goldInfoRef);
  useModalA11y(!!sellingAsset, closeSell, sellRef);

  // Nút nổi thêm tài sản — icon trùng tab con "Tài sản gia đình", ẩn khi đang mở modal
  useTabFab(
    !isFormOpen && !selectedPhoto && !showGoldPurityInfo && !sellingAsset
      ? { id: "assets", color: "emerald", title: "Thêm tài sản gia đình", icon: FileText, onClick: openCreateForm }
      : null
  );

  const canManageAsset = (asset: FamilyAsset) => {
    return currentUser.role === UserRole.ADMIN || asset.createdById === currentUser.id;
  };

  const handleTypeChange = (type: AssetType) => {
    setFormType(type);
    setFormUnit(defaultUnitForType(type));
  };

  const addPhotoFiles = async (files: File[]) => {
    if (files.length === 0) return;
    if (formPhotos.length + files.length > MAX_ASSET_PHOTOS) {
      setFormError(`Mỗi tài sản chỉ lưu được tối đa ${MAX_ASSET_PHOTOS} ảnh.`);
      return;
    }

    setFormError("");
    setImageProcessing(true);
    try {
      const optimizedPhotos: AssetPhoto[] = [];
      for (const file of files) {
        const full = await optimizeImageFile(file, {
          maxSourceBytes: 25 * 1024 * 1024,
          targetBytes: 900 * 1024,
          maxSizes: [1280, 1024, 768, 512],
          qualities: [0.86, 0.76, 0.66, 0.56],
          backgroundColor: "#ffffff"
        });
        const thumb = await optimizeImageFile(file, {
          maxSourceBytes: 25 * 1024 * 1024,
          targetBytes: 120 * 1024,
          maxSizes: [320, 240],
          qualities: [0.82, 0.7, 0.6],
          backgroundColor: "#ffffff"
        });
        // Persist as files on disk (organized under uploads/assets/<type>) and keep only the URLs.
        const [fullUrl, thumbUrl] = await Promise.all([
          uploadDataUrl(full.dataUrl, "assets", formType),
          uploadDataUrl(thumb.dataUrl, "assets", formType)
        ]);
        optimizedPhotos.push({
          id: `photo_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          fileName: file.name,
          thumbnailDataUrl: thumbUrl,
          fullDataUrl: fullUrl,
          width: full.width,
          height: full.height,
          sizeKb: full.sizeKb,
          createdAt: new Date().toISOString()
        });
      }
      setFormPhotos(prev => [...prev, ...optimizedPhotos]);
    } catch (err: any) {
      setFormError(err.message || "Không xử lý được ảnh tài sản.");
    } finally {
      setImageProcessing(false);
    }
  };

  const handlePhotoFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files: File[] = [];
    const fileList = e.currentTarget.files;
    if (fileList) {
      for (let i = 0; i < fileList.length; i++) {
        const file = fileList.item(i);
        if (file) files.push(file);
      }
    }
    e.currentTarget.value = "";
    void addPhotoFiles(files);
  };

  // Dán ảnh tài sản từ clipboard (Ctrl+V) khi form đang mở.
  const handlePhotoPaste = (e: React.ClipboardEvent) => {
    const imgs = Array.from(e.clipboardData?.items || [])
      .filter(it => it.kind === "file" && it.type.startsWith("image/"))
      .map(it => it.getAsFile())
      .filter((f): f is File => !!f);
    if (imgs.length === 0 || imageProcessing) return;
    e.preventDefault();
    void addPhotoFiles(imgs);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    if (!formName.trim()) {
      setFormError("Vui lòng nhập tên tài sản.");
      return;
    }

    try {
      await onSaveAsset({
        id: editingAsset?.id,
        type: formType,
        name: formName.trim(),
        ownerId: formOwnerId || undefined,
        quantity: Number(formQuantity) || 0,
        unit: formUnit.trim() || defaultUnitForType(formType),
        estimatedValue: Number(formEstimatedValue) || 0,
        purchaseValue: Number(formPurchaseValue) || undefined,
        currency: formCurrency,
        purchaseDate: formPurchaseDate || undefined,
        location: formLocation.trim(),
        notes: formNotes.trim(),
        photos: formPhotos,
        symbol: formSymbol.trim(),
        network: formNetwork.trim(),
        walletLabel: formWalletLabel.trim(),
        walletAddressMasked: formWalletAddressMasked.trim(),
        address: formAddress.trim(),
        areaM2: Number(formAreaM2) || undefined,
        certificateNo: formCertificateNo.trim(),
        parcelNo: formParcelNo.trim(),
        goldPurity: formGoldPurity.trim(),
        // Vàng: trọng lượng lưu từ Số lượng/Đơn vị (gộp, tránh nhập 2 lần).
        weight: isGoldType(formType) ? (Number(formQuantity) || undefined) : undefined,
        weightUnit: isGoldType(formType) ? formUnit.trim() : "",
        brand: formBrand.trim(),
        serialNo: formSerialNo.trim()
      });
      resetForm();
      setEditingAsset(null);
      setIsFormOpen(false);
    } catch (err: any) {
      setFormError(err.message || "Không lưu được tài sản.");
    }
  };

  const handleDelete = async (asset: FamilyAsset) => {
    const ok = await confirm({
      title: `Xóa tài sản "${asset.name}"?`,
      message: "Tài sản này cùng toàn bộ ảnh đính kèm sẽ bị xóa khỏi hệ thống. Bạn có chắc chắn muốn tiếp tục không?",
      confirmLabel: "Xóa tài sản",
      cancelLabel: "Đóng lại",
      tone: "danger"
    });
    if (!ok) return;
    await onDeleteAsset(asset.id);
  };

  const openSellForm = (asset: FamilyAsset) => {
    // Gợi ý giá bán = giá trị hiệu dụng hiện tại (live thị trường → ước tính → giá mua).
    const estimate = getEffectiveValue(asset, marketPrices).value;
    setSellingAsset(asset);
    setSellEstimate(estimate);
    setSellMode("estimate");
    setSellPrice(estimate);
    setSellAccount(AccountType.BANK);
    setSellDate(new Date().toISOString().slice(0, 10));
    setSellNote("");
    setSellError("");
  };

  const handleSellModeChange = (mode: "estimate" | "custom") => {
    setSellMode(mode);
    if (mode === "estimate") setSellPrice(sellEstimate);
  };

  const handleConfirmSell = async () => {
    if (!sellingAsset) return;
    setSellError("");
    const price = Number(sellPrice) || 0;
    if (price <= 0) {
      setSellError("Vui lòng nhập giá bán lớn hơn 0.");
      return;
    }
    if (!onSaveTransaction) {
      setSellError("Không ghi nhận được khoản thu từ bán tài sản.");
      return;
    }
    // Sổ thu chi chỉ tính bằng VNĐ — tài sản định giá USD sẽ quy đổi theo tỷ giá hiện tại.
    const rate = marketPrices?.usdVndRate || 25000;
    const amountVnd = sellingAsset.currency === "USD" ? Math.round(price * rate) : Math.round(price);
    const noteSuffix = sellNote.trim() ? ` — ${sellNote.trim()}` : "";
    setSelling(true);
    try {
      await onSaveTransaction({
        type: TransactionType.INCOME,
        amount: amountVnd,
        category: ASSET_SALE_CATEGORY,
        account: sellAccount,
        description: `Bán tài sản: ${sellingAsset.name}${noteSuffix}`,
        date: sellDate
      });
      await onDeleteAsset(sellingAsset.id);
      setSellingAsset(null);
    } catch (err: any) {
      setSellError(err.message || "Không ghi nhận được giao dịch bán tài sản.");
    } finally {
      setSelling(false);
    }
  };

  const fmtUsd = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
  const fmtVnd = (n: number) => Math.round(n).toLocaleString("vi-VN") + "đ";
  const changeBadge = (pct: number | null | undefined) => {
    if (pct === null || pct === undefined || isNaN(pct)) return null;
    const up = pct >= 0;
    return (
      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${up ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"}`}>
        {up ? "▲" : "▼"} {Math.abs(pct).toFixed(2)}%
      </span>
    );
  };
  const PriceSkeleton = () => (
    <>
      <span className="inline-block bg-slate-700/40 rounded-md animate-pulse align-middle h-5 w-24" />
      <span className="inline-block bg-slate-700/40 rounded-md animate-pulse align-middle h-2.5 w-20 mt-1" />
    </>
  );

  return (
    <div className="space-y-5" id="assets-module">
      {/* Market price widgets — BTC, ETH, Vàng, USD */}
      <Reveal className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6">
        {/* Bitcoin */}
        <div className="relative overflow-hidden bg-slate-900 neu-raised hover:border-amber-500/30 rounded-2xl p-4 shadow-md hover:shadow-lg hover:shadow-amber-500/10 hover:-translate-y-0.5 transition-all duration-300 flex flex-col justify-between min-h-[88px]">
          <ShimmerLine accent="amber" />
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-400">₿ Bitcoin</span>
            {widgetsOverview?.crypto?.bitcoin ? changeBadge(widgetsOverview.crypto.bitcoin.usd_24h_change) : null}
          </div>
          <div className="mt-2 flex flex-col gap-0.5">
            {marketPrices?.crypto["BTC"] ? (
              <>
                <p className="text-base font-extrabold text-slate-100 tabular-nums">{fmtUsd(marketPrices.crypto["BTC"].usd)}</p>
                <p className="text-[10px] text-slate-500 font-mono tabular-nums">{fmtVnd(marketPrices.crypto["BTC"].vnd)}</p>
              </>
            ) : <PriceSkeleton />}
          </div>
        </div>

        {/* Ethereum */}
        <div className="relative overflow-hidden bg-slate-900 neu-raised hover:border-indigo-500/30 rounded-2xl p-4 shadow-md hover:shadow-lg hover:shadow-indigo-500/10 hover:-translate-y-0.5 transition-all duration-300 flex flex-col justify-between min-h-[88px]">
          <ShimmerLine accent="indigo" />
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-indigo-400">Ξ Ethereum</span>
            {widgetsOverview?.crypto?.ethereum ? changeBadge(widgetsOverview.crypto.ethereum.usd_24h_change) : null}
          </div>
          <div className="mt-2 flex flex-col gap-0.5">
            {marketPrices?.crypto["ETH"] ? (
              <>
                <p className="text-base font-extrabold text-slate-100 tabular-nums">{fmtUsd(marketPrices.crypto["ETH"].usd)}</p>
                <p className="text-[10px] text-slate-500 font-mono tabular-nums">{fmtVnd(marketPrices.crypto["ETH"].vnd)}</p>
              </>
            ) : <PriceSkeleton />}
          </div>
        </div>

        {/* Vàng */}
        <div className="relative overflow-hidden bg-slate-900 neu-raised hover:border-yellow-500/30 rounded-2xl p-4 shadow-md hover:shadow-lg hover:shadow-yellow-500/10 hover:-translate-y-0.5 transition-all duration-300 flex flex-col justify-between min-h-[88px]">
          <ShimmerLine accent="yellow" />
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-yellow-500">🪙 {widgetsOverview?.gold?.source || "Vàng"}</span>
            {widgetsOverview?.gold ? changeBadge(widgetsOverview.gold.changePct) : null}
          </div>
          <div className="mt-2 flex flex-col gap-0.5">
            {marketPrices?.gold ? (
              <>
                <p className="text-base font-extrabold text-slate-100 tabular-nums">{fmtVnd(Math.round(marketPrices.gold.pricePerLuongVnd))}</p>
                <p className="text-[10px] text-slate-500">
                  {widgetsOverview?.gold?.buy ? `Mua ${fmtVnd(widgetsOverview.gold.buy)} • ` : ""}Bán /lượng
                </p>
              </>
            ) : <PriceSkeleton />}
          </div>
        </div>

        {/* USD/VND */}
        <div className="relative overflow-hidden bg-slate-900 neu-raised hover:border-emerald-500/30 rounded-2xl p-4 shadow-md hover:shadow-lg hover:shadow-emerald-500/10 hover:-translate-y-0.5 transition-all duration-300 flex flex-col justify-between min-h-[88px]">
          <ShimmerLine accent="emerald" />
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-400">💵 USD/VND</span>
            {marketPricesStatus === "ok" && (
              <span className="flex items-center gap-1 text-[9px] text-emerald-400/70">
                <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse inline-block" />
                Live
              </span>
            )}
            {marketPricesStatus === "loading" && (
              <RefreshCw className="size-3 text-slate-500 animate-spin" />
            )}
          </div>
          <div className="mt-2 flex flex-col gap-0.5">
            {marketPrices?.usdVndRate ? (
              <>
                <p className="text-base font-extrabold text-slate-100 tabular-nums">{fmtVnd(marketPrices.usdVndRate)}</p>
                <p className="text-[10px] text-slate-500">
                  Tỷ giá 1 USD
                  {marketPrices.lastUpdated ? ` · ${new Date(marketPrices.lastUpdated).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}` : ""}
                </p>
              </>
            ) : <PriceSkeleton />}
          </div>
        </div>
      </Reveal>

      <Reveal delay={0.06} className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4 xl:gap-6">
        <div className="bg-slate-900 neu-raised rounded-2xl p-4">
          <p className="text-[11px] text-slate-500">Tổng tài sản ước tính</p>
          <p className="mt-1 text-xl font-extrabold text-slate-100 tabular-nums">{formatMoney(stats.totalVnd)}</p>
          {stats.totalUsd > 0 && <p className="text-xs font-bold text-slate-400 tabular-nums">+ {formatMoney(stats.totalUsd, "USD")}</p>}
        </div>
        <div className="bg-slate-900 neu-raised rounded-2xl p-4">
          <p className="text-[11px] text-slate-500">Vàng các loại</p>
          <p className="mt-1 text-lg font-extrabold text-amber-400 tabular-nums">{formatMoney(stats.goldVnd)}</p>
          {stats.goldUsd > 0 && <p className="text-xs font-bold text-amber-400/70 tabular-nums">+ {formatMoney(stats.goldUsd, "USD")}</p>}
        </div>
        <div className="bg-slate-900 neu-raised rounded-2xl p-4">
          <p className="text-[11px] text-slate-500">Crypto</p>
          <p className="mt-1 text-lg font-extrabold text-sky-400 tabular-nums">{formatMoney(stats.cryptoVnd)}</p>
          {stats.cryptoUsd > 0 && <p className="text-xs font-bold text-sky-400/70 tabular-nums">+ {formatMoney(stats.cryptoUsd, "USD")}</p>}
        </div>
        <div className="bg-slate-900 neu-raised rounded-2xl p-4">
          <p className="text-[11px] text-slate-500">Sổ đất / BĐS</p>
          <p className="mt-1 text-lg font-extrabold text-emerald-400 tabular-nums">{formatMoney(stats.landVnd)}</p>
          {stats.landUsd > 0 && <p className="text-xs font-bold text-emerald-400/70 tabular-nums">+ {formatMoney(stats.landUsd, "USD")}</p>}
        </div>
      </Reveal>

      <Reveal delay={0.12} className="relative overflow-hidden bg-slate-900 neu-raised rounded-2xl p-4 space-y-3">
        <ShimmerLine accent="emerald" />
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 size-4 text-slate-500" />
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Tìm tên tài sản, mã sổ, ví crypto, vị trí lưu giữ..."
              className="w-full pl-9 pr-3 py-2 bg-slate-950 neu-pressed-sm rounded-xl text-xs text-slate-200 outline-none focus:border-emerald-500"
            />
          </div>
          <button
            type="button"
            onClick={openCreateForm}
            className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 px-4 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Plus className="size-4" /> Thêm tài sản
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px]">
          <div>
            <label className="text-slate-500 block mb-1">Loại tài sản</label>
            <FancySelect
              value={typeFilter}
              onChange={(v) => setTypeFilter(v as AssetType | "all")}
              ariaLabel="Lọc theo loại tài sản"
              options={[{ value: "all", label: "Tất cả tài sản" }, ...ASSET_TYPES]}
            />
          </div>
          <div>
            <label className="text-slate-500 block mb-1">Chủ sở hữu</label>
            <FancySelect
              value={ownerFilter}
              onChange={setOwnerFilter}
              ariaLabel="Lọc theo chủ sở hữu"
              options={[
                { value: "all", label: "Cả gia đình" },
                { value: "", label: "Chưa gán chủ sở hữu" },
                ...users.map(user => ({ value: user.id, label: user.fullName }))
              ]}
            />
          </div>
        </div>
      </Reveal>

      {filteredAssets.length === 0 ? (
        <div className="bg-slate-900/40 border border-dashed border-slate-800 rounded-2xl py-12 text-center space-y-3">
          <p className="text-sm text-slate-500">Chưa có tài sản nào phù hợp với bộ lọc.</p>
          <button type="button" onClick={openCreateForm} className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 px-4 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer">
            <Plus className="size-4" /> Thêm tài sản đầu tiên
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 xl:gap-6">
          {filteredAssets.map((asset, assetIndex) => {
            const owner = users.find(u => u.id === asset.ownerId);
            const creator = users.find(u => u.id === asset.createdById);
            const firstPhoto = asset.photos?.[0];
            const Icon = asset.type === "land" ? Landmark : asset.type === "crypto" ? Coins : asset.type === "vehicle" ? Car : asset.type === "stock" ? LineChart : isGoldType(asset.type) ? Gem : Wallet;

            return (
              <Reveal as="article" key={asset.id} delay={0.16 + staggerDelay(assetIndex)} hoverLift className="bg-slate-900 neu-raised hover:border-emerald-500/25 rounded-2xl p-4 shadow-lg hover:shadow-emerald-500/5 transition-[box-shadow,border-color] duration-300 space-y-4">
                <div className="flex gap-3">
                  <button
                    type="button"
                    disabled={!firstPhoto}
                    onClick={() => firstPhoto && setSelectedPhoto({ asset, photo: firstPhoto })}
                    className="size-20 rounded-xl neu-btn bg-slate-950 overflow-hidden shrink-0 flex items-center justify-center disabled:cursor-default cursor-pointer"
                    aria-label={firstPhoto ? `Xem ảnh tài sản ${asset.name}` : `Tài sản ${asset.name} chưa có ảnh`}
                  >
                    {firstPhoto ? (
                      <img src={firstPhoto.thumbnailDataUrl} alt={asset.name} className="size-full object-cover" />
                    ) : (
                      <Icon className="size-8 text-slate-600" />
                    )}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-lg border text-[10px] font-bold ${typeClass(asset.type)}`}>
                          {assetTypeLabel(asset.type)}
                        </span>
                        <h3 className="mt-1 text-sm font-bold text-slate-100 truncate">{asset.name}</h3>
                      </div>
                      {canManageAsset(asset) && (
                        <div className="flex items-center gap-1 shrink-0">
                          {onSaveTransaction && (
                            <button type="button" onClick={() => openSellForm(asset)} aria-label={`Bán tài sản ${asset.name}`} title="Bán tài sản" className="size-8 rounded-lg bg-slate-950 neu-btn text-slate-500 hover:text-emerald-400 flex items-center justify-center cursor-pointer">
                              <HandCoins className="size-3.5" />
                            </button>
                          )}
                          <button type="button" onClick={() => openEditForm(asset)} aria-label={`Sửa tài sản ${asset.name}`} className="size-8 rounded-lg bg-slate-950 neu-btn text-slate-500 hover:text-amber-400 flex items-center justify-center cursor-pointer">
                            <Pencil className="size-3.5" />
                          </button>
                          <button type="button" onClick={() => handleDelete(asset)} aria-label={`Xóa tài sản ${asset.name}`} className="size-8 rounded-lg bg-slate-950 neu-btn text-slate-500 hover:text-rose-400 flex items-center justify-center cursor-pointer">
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                    {(() => {
                      const ev = getEffectiveValue(asset, marketPrices);
                      // Lời/lỗ: chỉ tính khi có giá mua ban đầu và giá hiện tại không phải chính giá mua đó.
                      const purchase = Number(asset.purchaseValue || 0);
                      const showPL = purchase > 0 && ev.value > 0 && ev.source !== "purchase";
                      const diff = ev.value - purchase;
                      const pct = purchase > 0 ? (diff / purchase) * 100 : 0;
                      const up = diff >= 0;
                      return (
                        <>
                          <div className="mt-2 flex items-center gap-2 flex-wrap">
                            <p className="text-lg font-extrabold text-slate-100 tabular-nums">
                              {ev.source === "live" ? "≈ " : ""}{formatMoney(ev.value, asset.currency)}
                            </p>
                            {ev.source === "live" && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                                <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />LIVE
                              </span>
                            )}
                            {ev.source === "purchase" && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-slate-800 border border-slate-700 text-slate-400">
                                giá mua
                              </span>
                            )}
                            {showPL && (
                              <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold border ${up ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : "bg-rose-500/10 border-rose-500/20 text-rose-400"}`}>
                                {up ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
                                {up ? "+" : "−"}{Math.abs(pct).toFixed(1)}%
                              </span>
                            )}
                          </div>
                          {showPL && (
                            <p className="mt-1 text-[11px] text-slate-500">
                              Vốn {formatMoney(purchase, asset.currency)} ·{" "}
                              <span className={up ? "text-emerald-400" : "text-rose-400"}>
                                {up ? "Lời" : "Lỗ"} {formatMoney(Math.abs(diff), asset.currency)}
                              </span>
                            </p>
                          )}
                        </>
                      );
                    })()}
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
                      <span className="flex items-center gap-1"><UserIcon className="size-3" /> {owner ? owner.fullName : "Tài sản chung"}</span>
                      <span className="tabular-nums">
                        {isGoldType(asset.type)
                          ? `${effectiveGoldWeight(asset)} ${asset.weightUnit || asset.unit}`
                          : `${asset.quantity} ${asset.unit}`}
                      </span>
                      {asset.location && <span className="flex items-center gap-1"><MapPin className="size-3" /> {asset.location}</span>}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                  {asset.type === "crypto" && (
                    <>
                      <p className="bg-slate-950 neu-pressed-sm rounded-lg px-2.5 py-2 text-slate-400">Mã: <span className="text-sky-400 font-bold">{asset.symbol || "—"}</span></p>
                      <p className="bg-slate-950 neu-pressed-sm rounded-lg px-2.5 py-2 text-slate-400">Mạng: <span className="text-slate-200">{asset.network || "—"}</span></p>
                    </>
                  )}
                  {asset.type === "land" && (
                    <>
                      <p className="bg-slate-950 neu-pressed-sm rounded-lg px-2.5 py-2 text-slate-400">Diện tích: <span className="text-emerald-400 font-bold tabular-nums">{asset.areaM2 ? `${asset.areaM2} m2` : "—"}</span></p>
                      <p className="bg-slate-950 neu-pressed-sm rounded-lg px-2.5 py-2 text-slate-400">Số sổ: <span className="text-slate-200">{asset.certificateNo || "—"}</span></p>
                    </>
                  )}
                  {isGoldType(asset.type) && (
                    <>
                      <p className="bg-slate-950 neu-pressed-sm rounded-lg px-2.5 py-2 text-slate-400">Trọng lượng: <span className="text-amber-400 font-bold tabular-nums">{asset.weight ? `${asset.weight} ${asset.weightUnit || asset.unit}` : "—"}</span></p>
                      <p className="bg-slate-950 neu-pressed-sm rounded-lg px-2.5 py-2 text-slate-400">Tuổi vàng: <span className="text-slate-200">{goldPurityLabel(asset.goldPurity)}</span></p>
                    </>
                  )}
                  {asset.type === "vehicle" && (
                    <>
                      <p className="bg-slate-950 neu-pressed-sm rounded-lg px-2.5 py-2 text-slate-400">Hãng / dòng: <span className="text-orange-400 font-bold">{asset.brand || "—"}</span></p>
                      <p className="bg-slate-950 neu-pressed-sm rounded-lg px-2.5 py-2 text-slate-400">Biển số / số khung: <span className="text-slate-200">{asset.serialNo || "—"}</span></p>
                    </>
                  )}
                  {asset.type === "stock" && (
                    <>
                      <p className="bg-slate-950 neu-pressed-sm rounded-lg px-2.5 py-2 text-slate-400">Mã CP: <span className="text-violet-400 font-bold">{asset.symbol || "—"}</span></p>
                      <p className="bg-slate-950 neu-pressed-sm rounded-lg px-2.5 py-2 text-slate-400">Sàn / Cty CK: <span className="text-slate-200">{asset.brand || "—"}</span></p>
                    </>
                  )}
                </div>

                {(asset.notes || asset.photos?.length > 1) && (
                  <div className="pt-3 border-t border-slate-800 space-y-2">
                    {asset.notes && <p className="text-xs text-slate-500 line-clamp-2">{asset.notes}</p>}
                    {asset.photos?.length > 1 && (
                      <div className="flex flex-wrap gap-2">
                        {asset.photos.map(photo => (
                          <button key={photo.id} type="button" onClick={() => setSelectedPhoto({ asset, photo })} className="size-10 rounded-lg neu-btn overflow-hidden bg-slate-950 cursor-pointer" aria-label={`Xem ảnh ${photo.fileName}`}>
                            <img src={photo.thumbnailDataUrl} alt={photo.fileName} className="size-full object-cover" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-[10px] text-slate-600">
                  <span>Tạo bởi {creator ? creator.fullName : "thành viên"}</span>
                  <span className="tabular-nums">{new Date(asset.updatedAt).toLocaleDateString("vi-VN")}</span>
                </div>
              </Reveal>
            );
          })}
        </div>
      )}

      {isFormOpen && (
        <div className="fixed inset-0 bg-slate-950/85 flex items-center justify-center z-50 p-4" id="asset-form-modal">
          <motion.div
            ref={formRef}
            tabIndex={-1}
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl shadow-2xl max-h-[90vh] flex flex-col overflow-hidden outline-none"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 shrink-0">
              <h3 className="text-md font-bold text-slate-100">{editingAsset ? "Chỉnh sửa tài sản" : "Thêm tài sản gia đình"}</h3>
              <button type="button" onClick={closeForm} aria-label="Đóng form tài sản" className="size-8 rounded-lg bg-slate-800 text-slate-400 hover:text-slate-200 flex items-center justify-center">
                <X className="size-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} onPaste={handlePhotoPaste} className="flex flex-col min-h-0 flex-1 overflow-hidden text-xs">
              <div className="space-y-4 overflow-y-auto px-5 py-4 flex-1 min-h-0">
                {formError && (
                  <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl font-medium">
                    {formError}
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-slate-400 block font-semibold">Loại tài sản</label>
                    <FancySelect
                      value={formType}
                      onChange={(v) => handleTypeChange(v as AssetType)}
                      ariaLabel="Loại tài sản"
                      options={ASSET_TYPES}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-slate-400 block font-semibold">Tên tài sản <span className="text-rose-400">*</span></label>
                    <input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="VD: 2 lượng SJC, BTC ví lạnh, sổ đất Long An..." className="w-full bg-slate-950 neu-pressed-sm rounded-lg p-2.5 text-slate-200 outline-none focus:border-emerald-500" />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div className="space-y-1">
                    <label className="text-slate-400 block font-semibold">Chủ sở hữu</label>
                    <FancySelect
                      value={formOwnerId}
                      onChange={setFormOwnerId}
                      ariaLabel="Chủ sở hữu"
                      placeholder="Tài sản chung"
                      options={[
                        { value: "", label: "Tài sản chung" },
                        ...users.map(user => ({ value: user.id, label: user.fullName }))
                      ]}
                    />
                  </div>
                  {formType !== "land" && (
                    <>
                      <div className="space-y-1">
                        <label className="text-slate-400 block font-semibold">{isGoldType(formType) ? "Trọng lượng" : "Số lượng"}</label>
                        <input type="number" min="0" step="0.000001" value={formQuantity || ""} onChange={(e) => setFormQuantity(Number(e.target.value))} className="w-full bg-slate-950 neu-pressed-sm rounded-lg p-2.5 text-slate-200 outline-none" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-slate-400 block font-semibold">Đơn vị</label>
                        {isGoldType(formType) ? (
                          <FancySelect
                            value={formUnit}
                            onChange={setFormUnit}
                            ariaLabel="Đơn vị"
                            options={[
                              { value: "chỉ", label: "chỉ" },
                              { value: "lượng", label: "lượng" },
                              { value: "gram", label: "gram" }
                            ]}
                          />
                        ) : (
                          <input value={formUnit} onChange={(e) => setFormUnit(e.target.value)} className="w-full bg-slate-950 neu-pressed-sm rounded-lg p-2.5 text-slate-200 outline-none" />
                        )}
                      </div>
                    </>
                  )}
                  <div className="space-y-1">
                    <label className="text-slate-400 block font-semibold">Tiền tệ</label>
                    <FancySelect
                      value={formCurrency}
                      onChange={(v) => setFormCurrency(v as "VND" | "USD")}
                      ariaLabel="Tiền tệ"
                      options={[
                        { value: "VND", label: "VND" },
                        { value: "USD", label: "USD" }
                      ]}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="text-slate-400 block font-semibold">
                      Giá trị ước tính
                      {formAutoValue && formEstimatedValue === 0 && (
                        <span className="ml-1.5 text-[9px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded-full">AUTO</span>
                      )}
                    </label>
                    <input inputMode="numeric" value={formatMoneyInput(formEstimatedValue)} onChange={(e) => setFormEstimatedValue(parseMoneyInput(e.target.value))} className="w-full bg-slate-950 neu-pressed-sm rounded-lg p-2.5 text-slate-200 outline-none font-mono" />
                    {formAutoValue && (
                      <p className="text-[10px] text-emerald-400/70 flex items-center gap-1">
                        <TrendingUp className="size-3 shrink-0" />
                        ≈ {formatMoney(formAutoValue.value, formCurrency)}
                        <span className="text-slate-600">({formAutoValue.label})</span>
                        {formEstimatedValue === 0 && <span className="text-slate-500"> — Để 0 để dùng tự động</span>}
                      </p>
                    )}
                    {!formAutoValue && (isGoldType(formType) || formType === "crypto") && marketPrices && (
                      <p className="text-[10px] text-slate-600">
                        {isGoldType(formType)
                          ? `Nhập trọng lượng để tự tính từ giá vàng thị trường`
                          : `Nhập mã coin & số lượng để tự tính giá thị trường`}
                      </p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <label className="text-slate-400 block font-semibold">Giá mua ban đầu</label>
                    <input inputMode="numeric" value={formatMoneyInput(formPurchaseValue)} onChange={(e) => setFormPurchaseValue(parseMoneyInput(e.target.value))} className="w-full bg-slate-950 neu-pressed-sm rounded-lg p-2.5 text-slate-200 outline-none font-mono" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-slate-400 block font-semibold">Ngày mua / ghi nhận</label>
                    <DateInputDMY value={formPurchaseDate} onChange={setFormPurchaseDate} className="w-full bg-slate-950 neu-pressed-sm rounded-lg p-2.5 text-slate-200 outline-none font-mono" />
                  </div>
                </div>

                {formType === "crypto" && (
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-slate-950/40 neu-pressed-sm rounded-xl p-3">
                    <input value={formSymbol} onChange={(e) => setFormSymbol(e.target.value.toUpperCase())} placeholder="Mã coin: BTC" className="bg-slate-950 neu-pressed-sm rounded-lg p-2.5 text-slate-200 outline-none" />
                    <input value={formNetwork} onChange={(e) => setFormNetwork(e.target.value)} placeholder="Network: Bitcoin/ERC20" className="bg-slate-950 neu-pressed-sm rounded-lg p-2.5 text-slate-200 outline-none" />
                    <input value={formWalletLabel} onChange={(e) => setFormWalletLabel(e.target.value)} placeholder="Ví: Ledger/Binance" className="bg-slate-950 neu-pressed-sm rounded-lg p-2.5 text-slate-200 outline-none" />
                    <input value={formWalletAddressMasked} onChange={(e) => setFormWalletAddressMasked(e.target.value)} placeholder="Địa chỉ rút gọn" className="bg-slate-950 neu-pressed-sm rounded-lg p-2.5 text-slate-200 outline-none" />
                    {marketPrices && formSymbol && marketPrices.crypto[formSymbol.toUpperCase()] && (
                      <div className="md:col-span-4 flex items-center gap-2 text-[10px] text-sky-400/80">
                        <TrendingUp className="size-3 shrink-0" />
                        {formSymbol}: <span className="font-bold">${marketPrices.crypto[formSymbol.toUpperCase()].usd.toLocaleString("en-US")}</span>
                        <span className="text-slate-600">≈ {formatMoney(Math.round(marketPrices.crypto[formSymbol.toUpperCase()].vnd))}</span>
                        <span className="text-slate-700">/ coin</span>
                      </div>
                    )}
                    {marketPrices && formSymbol && !marketPrices.crypto[formSymbol.toUpperCase()] && formSymbol.length >= 2 && (
                      <p className="md:col-span-4 text-[10px] text-slate-600">Chưa có giá live cho {formSymbol} — nhập giá trị ước tính thủ công.</p>
                    )}
                  </div>
                )}

                {formType === "land" && (
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-slate-950/40 neu-pressed-sm rounded-xl p-3">
                    <input value={formAddress} onChange={(e) => setFormAddress(e.target.value)} placeholder="Địa chỉ/thửa đất" className="md:col-span-2 bg-slate-950 neu-pressed-sm rounded-lg p-2.5 text-slate-200 outline-none" />
                    <input type="number" min="0" step="0.01" value={formAreaM2 || ""} onChange={(e) => setFormAreaM2(Number(e.target.value))} placeholder="Diện tích m2" className="bg-slate-950 neu-pressed-sm rounded-lg p-2.5 text-slate-200 outline-none" />
                    <input value={formCertificateNo} onChange={(e) => setFormCertificateNo(e.target.value)} placeholder="Số sổ" className="bg-slate-950 neu-pressed-sm rounded-lg p-2.5 text-slate-200 outline-none" />
                    <input value={formParcelNo} onChange={(e) => setFormParcelNo(e.target.value)} placeholder="Số thửa/tờ bản đồ" className="md:col-span-2 bg-slate-950 neu-pressed-sm rounded-lg p-2.5 text-slate-200 outline-none" />
                  </div>
                )}

                {isGoldType(formType) && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-slate-950/40 neu-pressed-sm rounded-xl p-3">
                    <div className="flex items-center gap-1.5">
                      <FancySelect
                        value={normalizeGoldPurity(formGoldPurity)}
                        onChange={setFormGoldPurity}
                        ariaLabel="Tuổi vàng"
                        placeholder="— Tuổi vàng —"
                        className="flex-1 min-w-0"
                        options={[
                          { value: "", label: "— Tuổi vàng —" },
                          ...GOLD_PURITY_OPTIONS.map(o => ({ value: o.value, label: `${o.label} (${Math.round(o.factor * 100)}%)` }))
                        ]}
                      />
                      <button type="button" onClick={() => setShowGoldPurityInfo(true)} aria-label="Bảng quy ước tuổi vàng" title="Bảng quy ước tuổi vàng" className="shrink-0 size-9 rounded-lg bg-slate-800 border border-slate-700 text-amber-400 hover:bg-slate-700 flex items-center justify-center cursor-pointer">
                        <Info className="size-4" />
                      </button>
                    </div>
                    <input value={formBrand} onChange={(e) => setFormBrand(e.target.value)} placeholder="SJC/PNJ/DOJI" className="bg-slate-950 neu-pressed-sm rounded-lg p-2.5 text-slate-200 outline-none" />
                    <input value={formSerialNo} onChange={(e) => setFormSerialNo(e.target.value)} placeholder="Số seri nếu có" className="bg-slate-950 neu-pressed-sm rounded-lg p-2.5 text-slate-200 outline-none" />
                    {marketPrices?.gold && (
                      <div className="md:col-span-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-amber-400/80">
                        <span className="flex items-center gap-1"><TrendingUp className="size-3" /> Giá vàng 9999 tham chiếu:</span>
                        <span className="font-bold">{formatMoney(Math.round(marketPrices.gold.pricePerChiVnd))}/chỉ</span>
                        <span className="text-amber-400/50">· {formatMoney(Math.round(marketPrices.gold.pricePerLuongVnd))}/lượng</span>
                        <span className="text-amber-400/50">· {formatMoney(Math.round(marketPrices.gold.pricePerGramVnd))}/gram</span>
                        <span className="text-slate-500">— giá tuổi vàng khác = giá 9999 × hệ số quy ước</span>
                      </div>
                    )}
                  </div>
                )}

                {formType === "vehicle" && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-slate-950/40 neu-pressed-sm rounded-xl p-3">
                    <input value={formBrand} onChange={(e) => setFormBrand(e.target.value)} placeholder="Hãng / dòng xe: Honda SH, Toyota Vios" className="bg-slate-950 neu-pressed-sm rounded-lg p-2.5 text-slate-200 outline-none" />
                    <input value={formSerialNo} onChange={(e) => setFormSerialNo(e.target.value)} placeholder="Biển số / số khung" className="bg-slate-950 neu-pressed-sm rounded-lg p-2.5 text-slate-200 outline-none" />
                  </div>
                )}

                {formType === "stock" && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-slate-950/40 neu-pressed-sm rounded-xl p-3">
                    <input value={formSymbol} onChange={(e) => setFormSymbol(e.target.value.toUpperCase())} placeholder="Mã CP: VNM, FPT, HPG" className="bg-slate-950 neu-pressed-sm rounded-lg p-2.5 text-slate-200 outline-none" />
                    <input value={formBrand} onChange={(e) => setFormBrand(e.target.value)} placeholder="Sàn / Cty CK: HOSE, SSI, VND" className="bg-slate-950 neu-pressed-sm rounded-lg p-2.5 text-slate-200 outline-none" />
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <input value={formLocation} onChange={(e) => setFormLocation(e.target.value)} placeholder="Nơi lưu giữ / vị trí" className="bg-slate-950 neu-pressed-sm rounded-lg p-2.5 text-slate-200 outline-none" />
                  <textarea rows={2} value={formNotes} onChange={(e) => setFormNotes(e.target.value)} placeholder="Ghi chú: tình trạng, người giữ, lưu ý bảo mật..." className="bg-slate-950 neu-pressed-sm rounded-lg p-2.5 text-slate-200 outline-none" />
                </div>

                <div className="bg-slate-950/40 neu-pressed-sm rounded-xl p-3 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-bold text-slate-200 flex items-center gap-1.5"><ImageIcon className="size-4 text-sky-400" /> Ảnh tài sản</p>
                      <p className="text-[10px] text-slate-500">Ảnh sẽ tự thu nhỏ cho nhẹ máy mà vẫn xem rõ.</p>
                    </div>
                    <label className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-slate-800 text-sky-400 hover:bg-slate-700 ${imageProcessing ? "opacity-60 cursor-wait pointer-events-none" : "cursor-pointer"}`}>
                      <Upload className="size-4" /> {imageProcessing ? "Đang tối ưu..." : "Chụp / tải ảnh"}
                      <input type="file" accept="image/*,.heic,.heif" multiple onChange={handlePhotoFiles} disabled={imageProcessing} className="hidden" />
                    </label>
                  </div>
                  {formPhotos.length > 0 && (
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                      {formPhotos.map(photo => (
                        <div key={photo.id} className="relative rounded-xl overflow-hidden neu-pressed-sm bg-slate-950 aspect-square">
                          <img src={photo.thumbnailDataUrl} alt={photo.fileName} className="size-full object-cover" />
                          <button type="button" onClick={() => setFormPhotos(prev => prev.filter(p => p.id !== photo.id))} aria-label={`Xóa ảnh ${photo.fileName}`} className="absolute right-1 top-1 size-6 rounded-lg bg-slate-950/90 text-slate-400 hover:text-rose-400 flex items-center justify-center">
                            <X className="size-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 px-5 py-4 border-t border-slate-800 shrink-0">
                <button type="button" onClick={closeForm} disabled={imageProcessing} className="px-4 py-2 bg-slate-950 text-slate-400 hover:bg-slate-800 hover:text-slate-200 rounded-xl font-bold disabled:opacity-50">
                  Đóng lại
                </button>
                <button type="submit" disabled={imageProcessing} className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl font-bold disabled:opacity-50">
                  {editingAsset ? "Lưu thay đổi" : "Lưu tài sản"}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {selectedPhoto && (
        <div onClick={() => setSelectedPhoto(null)} className="fixed inset-0 bg-slate-950/90 flex items-center justify-center z-50 p-4" id="asset-photo-viewer">
          <div ref={photoRef} tabIndex={-1} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Xem ảnh tài sản" className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col outline-none">
            <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-100 truncate">{selectedPhoto.asset.name}</p>
                <p className="text-[11px] text-slate-500 tabular-nums">{selectedPhoto.photo.width}x{selectedPhoto.photo.height} • {selectedPhoto.photo.sizeKb}KB</p>
              </div>
              <button type="button" onClick={() => setSelectedPhoto(null)} aria-label="Đóng ảnh tài sản" className="size-8 rounded-lg bg-slate-800 text-slate-400 hover:text-slate-200 flex items-center justify-center shrink-0">
                <X className="size-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 bg-slate-950 flex items-center justify-center p-3">
              <img src={selectedPhoto.photo.fullDataUrl} alt={selectedPhoto.photo.fileName} className="max-h-[72vh] max-w-full object-contain rounded-lg" />
            </div>
          </div>
        </div>
      )}

      {showGoldPurityInfo && (
        <div onClick={() => setShowGoldPurityInfo(false)} className="fixed inset-0 bg-slate-950/90 flex items-center justify-center z-50 p-4" id="gold-purity-info">
          <div ref={goldInfoRef} tabIndex={-1} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md max-h-[90vh] overflow-hidden shadow-2xl flex flex-col outline-none">
            <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between gap-3">
              <p className="text-sm font-bold text-slate-100 flex items-center gap-1.5"><Gem className="size-4 text-amber-400" /> Bảng quy ước tuổi vàng</p>
              <button type="button" onClick={() => setShowGoldPurityInfo(false)} aria-label="Đóng" className="size-8 rounded-lg bg-slate-800 text-slate-400 hover:text-slate-200 flex items-center justify-center shrink-0">
                <X className="size-4" />
              </button>
            </div>
            <div className="overflow-y-auto p-4 space-y-3">
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Giá trị vàng ước tính theo công thức: <span className="text-amber-400 font-semibold">trọng lượng × giá vàng 9999 × hệ số tuổi vàng</span>.
                Vàng tuổi cao gần đúng hàm lượng; tuổi thấp bị trừ thêm hao công và chênh lệch thu mua nên hệ số thấp hơn hàm lượng lý thuyết một chút (sát giá bán lại thực tế).
              </p>
              <table className="w-full text-[11px] tabular-nums">
                <thead>
                  <tr className="text-slate-500 border-b border-slate-800">
                    <th className="text-left font-semibold py-1.5">Tuổi vàng</th>
                    <th className="text-right font-semibold py-1.5">Hàm lượng</th>
                    <th className="text-right font-semibold py-1.5">Hệ số</th>
                  </tr>
                </thead>
                <tbody>
                  {GOLD_PURITY_OPTIONS.map(o => (
                    <tr key={o.value} className="border-b border-slate-800/50">
                      <td className="py-1.5 text-slate-200">{o.label}</td>
                      <td className="py-1.5 text-right text-slate-500">{o.content}</td>
                      <td className="py-1.5 text-right font-bold text-amber-400">{o.factor.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-[10px] text-slate-600 leading-relaxed">
                Số liệu tham khảo thị trường (06/2026, vàng 9999 ~14.7tr/chỉ): 18K bán ~11tr, 14K ~8.3tr, 10K ~5.8tr/chỉ.
                Đây là ước lượng tương đối — bạn có thể nhập "Giá trị ước tính" thủ công để ghi đè.
              </p>
            </div>
          </div>
        </div>
      )}

      {sellingAsset && (
        <div className="fixed inset-0 bg-slate-950/85 flex items-center justify-center z-50 p-4" id="asset-sell-modal">
          <motion.div
            ref={sellRef}
            tabIndex={-1}
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] flex flex-col overflow-hidden outline-none"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 shrink-0">
              <h3 className="text-md font-bold text-slate-100 flex items-center gap-1.5">
                <HandCoins className="size-5 text-emerald-400" /> Bán tài sản
              </h3>
              <button type="button" onClick={closeSell} disabled={selling} aria-label="Đóng" className="size-8 rounded-lg bg-slate-800 text-slate-400 hover:text-slate-200 flex items-center justify-center disabled:opacity-50">
                <X className="size-4" />
              </button>
            </div>

            <div className="space-y-4 overflow-y-auto px-5 py-4 flex-1 min-h-0 text-xs">
              {sellError && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl font-medium">{sellError}</div>
              )}

              <div className="bg-slate-950/50 neu-pressed-sm rounded-xl p-3">
                <p className="text-[11px] text-slate-500">Tài sản</p>
                <p className="text-sm font-bold text-slate-100 truncate">{sellingAsset.name}</p>
                <p className="mt-1 text-[11px] text-slate-500">
                  Giá trị ước lượng hiện tại:{" "}
                  <span className="text-emerald-400 font-bold">{sellEstimate > 0 ? formatMoney(sellEstimate, sellingAsset.currency) : "Chưa xác định"}</span>
                </p>
              </div>

              {/* Chọn cách định giá bán */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleSellModeChange("estimate")}
                  disabled={sellEstimate <= 0}
                  className={`px-3 py-2.5 rounded-xl font-bold border transition-all ${sellMode === "estimate" ? "bg-emerald-500 text-slate-950 border-emerald-500" : "bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200"} disabled:opacity-40 disabled:cursor-not-allowed`}
                >
                  Theo giá ước lượng
                </button>
                <button
                  type="button"
                  onClick={() => handleSellModeChange("custom")}
                  className={`px-3 py-2.5 rounded-xl font-bold border transition-all ${sellMode === "custom" ? "bg-emerald-500 text-slate-950 border-emerald-500" : "bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200"}`}
                >
                  Tự nhập giá
                </button>
              </div>

              <div className="space-y-1">
                <label className="text-slate-400 block font-semibold">Giá bán thực tế ({sellingAsset.currency})</label>
                <input
                  inputMode="numeric"
                  value={formatMoneyInput(sellPrice)}
                  onChange={(e) => { setSellMode("custom"); setSellPrice(parseMoneyInput(e.target.value)); }}
                  className="w-full bg-slate-950 neu-pressed-sm rounded-lg p-2.5 text-slate-200 outline-none focus:border-emerald-500 font-mono text-base font-bold"
                />
                {sellingAsset.currency === "USD" && sellPrice > 0 && (
                  <p className="text-[10px] text-slate-500">
                    ≈ {formatMoney(Math.round(sellPrice * (marketPrices?.usdVndRate || 25000)))} (quy đổi theo tỷ giá {(marketPrices?.usdVndRate || 25000).toLocaleString("vi-VN")}đ/USD)
                  </p>
                )}
                {(() => {
                  const purchase = Number(sellingAsset.purchaseValue || 0);
                  if (purchase <= 0 || sellPrice <= 0) return null;
                  const diff = sellPrice - purchase;
                  const up = diff >= 0;
                  const pct = (diff / purchase) * 100;
                  return (
                    <p className={`text-[10px] flex items-center gap-1 ${up ? "text-emerald-400" : "text-rose-400"}`}>
                      {up ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
                      So với giá mua {formatMoney(purchase, sellingAsset.currency)}: {up ? "Lời" : "Lỗ"} {formatMoney(Math.abs(diff), sellingAsset.currency)} ({up ? "+" : "−"}{Math.abs(pct).toFixed(1)}%)
                    </p>
                  );
                })()}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-slate-400 block font-semibold">Tiền vào ví</label>
                  <FancySelect
                    value={sellAccount}
                    onChange={(v) => setSellAccount(v as AccountType)}
                    ariaLabel="Tiền vào ví"
                    options={SELL_ACCOUNTS}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-slate-400 block font-semibold">Ngày bán</label>
                  <DateInputDMY value={sellDate} onChange={setSellDate} className="w-full bg-slate-950 neu-pressed-sm rounded-lg p-2.5 text-slate-200 outline-none font-mono" />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-slate-400 block font-semibold">Ghi chú (không bắt buộc)</label>
                <input value={sellNote} onChange={(e) => setSellNote(e.target.value)} placeholder="VD: bán cho người quen, đã nhận đủ tiền..." className="w-full bg-slate-950 neu-pressed-sm rounded-lg p-2.5 text-slate-200 outline-none focus:border-emerald-500" />
              </div>

              <p className="text-[10px] text-slate-500 leading-relaxed">
                Khi xác nhận: hệ thống ghi một khoản <span className="text-emerald-400 font-semibold">THU</span> với hạng mục "{ASSET_SALE_CATEGORY}" vào sổ thu chi, sau đó xóa tài sản này khỏi danh sách.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2.5 px-5 py-4 border-t border-slate-800 shrink-0">
              <button type="button" onClick={closeSell} disabled={selling} className="px-4 py-2 bg-slate-950 text-slate-400 hover:bg-slate-800 hover:text-slate-200 rounded-xl font-bold disabled:opacity-50">
                Hủy
              </button>
              <button type="button" onClick={handleConfirmSell} disabled={selling || sellPrice <= 0} className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl font-bold disabled:opacity-50 flex items-center gap-1.5">
                <HandCoins className="size-4" /> {selling ? "Đang ghi nhận..." : "Xác nhận bán"}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {ConfirmDialog}
    </div>
  );
}
