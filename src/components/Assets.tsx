/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button, Input, Textarea } from "./ui";
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
  Pin,
  PinOff,
  Plus,
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
import { useTranslation } from "react-i18next";
import {
  AccountType,
  AssetPhoto,
  AssetType,
  BuiltInAssetType,
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
import { currentLocalDate } from "../utils/dateTime.js";
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

const MAX_ASSET_PHOTOS = 8;

const CUSTOM_ASSET_PREFIX = "custom:";

function isBuiltInAssetType(type: AssetType): type is BuiltInAssetType {
  return type === "crypto" || type === "land" || type === "gold_bar" || type === "gold_ring" || type === "gold_jewelry" || type === "gold_other" || type === "vehicle" || type === "stock" || type === "other";
}

function isCustomAssetType(type: AssetType) {
  return type.startsWith(CUSTOM_ASSET_PREFIX);
}

function customAssetTypeLabel(type: AssetType) {
  return isCustomAssetType(type) ? type.slice(CUSTOM_ASSET_PREFIX.length).replace(/-/g, " ").trim() : "";
}

function makeCustomAssetType(label: string) {
  const slug = label.trim().toLowerCase().replace(/[^a-z0-9\u00C0-\u024F]+/gi, "-").replace(/^-+|-+$/g, "");
  return `${CUSTOM_ASSET_PREFIX}${slug || "loai-moi"}` as AssetType;
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
  if (isCustomAssetType(type)) return "text-cyan-400 bg-cyan-500/10 border-cyan-500/20";
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
  const { t } = useTranslation();
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
  const [sellDate, setSellDate] = useState(currentLocalDate());
  const [sellNote, setSellNote] = useState("");
  const [sellError, setSellError] = useState("");
  const [selling, setSelling] = useState(false);

  const [formType, setFormType] = useState<AssetType>("gold_bar");
  const [formCustomTypeName, setFormCustomTypeName] = useState("");
  const [formName, setFormName] = useState("");
  const [formOwnerId, setFormOwnerId] = useState("");
  const [formQuantity, setFormQuantity] = useState<number>(1);
  const [formUnit, setFormUnit] = useState(defaultUnitForType("gold_bar"));
  const [formEstimatedValue, setFormEstimatedValue] = useState<number>(0);
  const [formPurchaseValue, setFormPurchaseValue] = useState<number>(0);
  const [formCurrency, setFormCurrency] = useState<"VND" | "USD">("VND");
  const [formPurchaseDate, setFormPurchaseDate] = useState(currentLocalDate());
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

  const SELL_ACCOUNTS = useMemo(() => [
    { value: AccountType.BANK, label: t("accounts.bankEmoji") },
    { value: AccountType.CASH, label: t("accounts.cashEmoji") },
    { value: AccountType.E_WALLET, label: t("accounts.eWalletEmoji") }
  ], [t]);

  const ASSET_TYPES = useMemo(() => [
    { value: "crypto" as AssetType, label: t("assets.typeCryptoLabel"), short: t("assets.typeCryptoShort") },
    { value: "land" as AssetType, label: t("assets.typeLandLabel"), short: t("assets.typeLandShort") },
    { value: "gold_bar" as AssetType, label: t("assets.typeGoldBarLabel"), short: t("assets.typeGoldBarShort") },
    { value: "gold_ring" as AssetType, label: t("assets.typeGoldRingLabel"), short: t("assets.typeGoldRingShort") },
    { value: "gold_jewelry" as AssetType, label: t("assets.typeGoldJewelryLabel"), short: t("assets.typeGoldJewelryShort") },
    { value: "gold_other" as AssetType, label: t("assets.typeGoldOtherLabel"), short: t("assets.typeGoldOtherShort") },
    { value: "vehicle" as AssetType, label: t("assets.typeVehicleLabel"), short: t("assets.typeVehicleShort") },
    { value: "stock" as AssetType, label: t("assets.typeStockLabel"), short: t("assets.typeStockShort") },
    { value: "other" as AssetType, label: t("assets.typeOtherLabel"), short: t("assets.typeOtherShort") }
  ], [t]);

  const formTypeOptions = useMemo(() => [
    ...ASSET_TYPES,
    { value: makeCustomAssetType(formCustomTypeName || "Loại khác"), label: formCustomTypeName.trim() || t("assets.typeCustomLabel"), short: formCustomTypeName.trim() || t("assets.typeCustomShort") }
  ], [ASSET_TYPES, formCustomTypeName, t]);

  const assetTypeLabel = useCallback((type: AssetType) => {
    if (isCustomAssetType(type)) {
      return customAssetTypeLabel(type) || t("assets.typeCustomShort");
    }
    return ASSET_TYPES.find(at => at.value === type)?.short || t("assets.typeOtherShort");
  }, [ASSET_TYPES, t]);

  const assetTypeFilterOptions = useMemo(() => {
    const customTypes = Array.from(new Set(assets.map(asset => asset.type).filter(isCustomAssetType)))
      .sort((a, b) => assetTypeLabel(a).localeCompare(assetTypeLabel(b), "vi"))
      .map(type => ({ value: type, label: assetTypeLabel(type) }));
    return [{ value: "all", label: t("assets.typeFilterAll") }, ...ASSET_TYPES, ...customTypes];
  }, [ASSET_TYPES, assetTypeLabel, assets, t]);

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
      const purityNote = factor < 1 ? t("assets.goldPurityPctSuffix", { pct: Math.round(factor * 100) }) : "";
      return v > 0 ? { value: v, label: t("assets.goldAutoCalcLabel", { qty: formQuantity, unit: formUnit, purityNote }) } : null;
    }
    if (formType === "crypto" && formSymbol && formQuantity > 0) {
      const coin = marketPrices.crypto[formSymbol.toUpperCase()];
      if (!coin) return null;
      const price = formCurrency === "USD" ? coin.usd : coin.vnd;
      const v = Math.round(formQuantity * price);
      return v > 0 ? { value: v, label: t("assets.cryptoAutoCalcLabel", { qty: formQuantity, symbol: formSymbol, price: coin.usd.toLocaleString("en-US") }) } : null;
    }
    return null;
  }, [t, marketPrices, formType, formGoldPurity, formCurrency, formSymbol, formQuantity, formUnit]);

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
        assetTypeLabel(asset.type),
        asset.symbol,
        asset.network,
        asset.address,
        asset.certificateNo,
        asset.brand,
        asset.serialNo
      ].some(value => String(value || "").toLowerCase().includes(text));
    }).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [assets, searchTerm, typeFilter, ownerFilter, assetTypeLabel]);

  const pinnedAssets = useMemo(() => {
    return assets.filter(asset => asset.isPinned).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [assets]);

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
    setFormCustomTypeName("");
    setFormName("");
    setFormOwnerId("");
    setFormQuantity(1);
    setFormUnit(defaultUnitForType("gold_bar"));
    setFormEstimatedValue(0);
    setFormPurchaseValue(0);
    setFormCurrency("VND");
    setFormPurchaseDate(currentLocalDate());
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
    setFormCustomTypeName(isCustomAssetType(asset.type) ? customAssetTypeLabel(asset.type) : "");
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
    setFormPurchaseDate(asset.purchaseDate || currentLocalDate());
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
      ? { id: "assets", color: "emerald", title: t("assets.fabTitle"), icon: FileText, onClick: openCreateForm }
      : null
  );

  const canManageAsset = (asset: FamilyAsset) => {
    return currentUser.role === UserRole.ADMIN || asset.createdById === currentUser.id;
  };

  const handleTypeChange = (type: AssetType) => {
    setFormType(type);
    setFormUnit(defaultUnitForType(type));
    if (isBuiltInAssetType(type)) setFormCustomTypeName("");
  };

  const handleCustomTypeNameChange = (name: string) => {
    setFormCustomTypeName(name);
    setFormType(makeCustomAssetType(name));
    setFormUnit(defaultUnitForType(makeCustomAssetType(name)));
  };

  const addPhotoFiles = async (files: File[]) => {
    if (files.length === 0) return;
    if (formPhotos.length + files.length > MAX_ASSET_PHOTOS) {
      setFormError(t("assets.errorMaxPhotos", { max: MAX_ASSET_PHOTOS }));
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
          uploadDataUrl(full.dataUrl, "assets", isCustomAssetType(formType) ? "other" : formType),
          uploadDataUrl(thumb.dataUrl, "assets", isCustomAssetType(formType) ? "other" : formType)
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
      setFormError(err.message || t("assets.errorProcessingPhoto"));
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
      setFormError(t("assets.errorAssetNameRequired"));
      return;
    }

    const saveType = isCustomAssetType(formType) ? makeCustomAssetType(formCustomTypeName || customAssetTypeLabel(formType)) : formType;

    try {
      await onSaveAsset({
        id: editingAsset?.id,
        type: saveType,
        name: formName.trim(),
        ownerId: formOwnerId || undefined,
        quantity: Number(formQuantity) || 0,
        unit: formUnit.trim() || defaultUnitForType(saveType),
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
        weight: isGoldType(saveType) ? (Number(formQuantity) || undefined) : undefined,
        weightUnit: isGoldType(saveType) ? formUnit.trim() : "",
        brand: formBrand.trim(),
        serialNo: formSerialNo.trim()
      });
      resetForm();
      setEditingAsset(null);
      setIsFormOpen(false);
    } catch (err: any) {
      setFormError(err.message || t("assets.errorSavingAsset"));
    }
  };

  const handleDelete = async (asset: FamilyAsset) => {
    const ok = await confirm({
      title: t("assets.confirmDeleteTitle", { name: asset.name }),
      message: t("assets.confirmDeleteMessage"),
      confirmLabel: t("assets.confirmDeleteButton"),
      cancelLabel: t("common.close"),
      tone: "danger"
    });
    if (!ok) return;
    await onDeleteAsset(asset.id);
  };

  const handleTogglePin = async (asset: FamilyAsset) => {
    await onSaveAsset({
      ...asset,
      isPinned: !asset.isPinned
    });
  };

  const openSellForm = (asset: FamilyAsset) => {
    // Gợi ý giá bán = giá trị hiệu dụng hiện tại (live thị trường → ước tính → giá mua).
    const estimate = getEffectiveValue(asset, marketPrices).value;
    setSellingAsset(asset);
    setSellEstimate(estimate);
    setSellMode("estimate");
    setSellPrice(estimate);
    setSellAccount(AccountType.BANK);
    setSellDate(currentLocalDate());
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
      setSellError(t("assets.errorSellPriceRequired"));
      return;
    }
    if (!onSaveTransaction) {
      setSellError(t("assets.errorSellTransaction"));
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
      setSellError(err.message || t("assets.errorSellTransactionFailed"));
    } finally {
      setSelling(false);
    }
  };

  return (
    <div className="space-y-5" id="assets-module">
      {pinnedAssets.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-100">
            <Pin className="size-4 text-emerald-400 fill-current" />
            {t("assets.pinnedSectionTitle")}
          </div>
          <Reveal className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4 xl:gap-6">
          {pinnedAssets.map((asset, assetIndex) => {
            const owner = users.find(u => u.id === asset.ownerId);
            const firstPhoto = asset.photos?.[0];
            const Icon = asset.type === "land" ? Landmark : asset.type === "crypto" ? Coins : asset.type === "vehicle" ? Car : asset.type === "stock" ? LineChart : isGoldType(asset.type) ? Gem : Wallet;
            const ev = getEffectiveValue(asset, marketPrices);
            const label = assetTypeLabel(asset.type);
            return (
              <Reveal as="article" key={asset.id} delay={0.04 * assetIndex} hoverLift className="relative overflow-hidden bg-slate-900 neu-raised rounded-2xl p-4 shadow-lg transition-[box-shadow,border-color] duration-300 space-y-3 border border-emerald-500/15">
                <ShimmerLine accent="emerald" />
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-emerald-400 truncate">{t("assets.pinnedBadge")}</p>
                    <h3 className="mt-1 text-sm font-bold text-slate-100 truncate">{asset.name}</h3>
                  </div>
                  <Button type="button" onClick={() => handleTogglePin(asset)} aria-label={t("assets.unpinAssetAriaLabel", { name: asset.name })} className="size-8 rounded-lg bg-slate-950 neu-btn text-emerald-400 flex items-center justify-center cursor-pointer shrink-0">
                    <PinOff className="size-3.5" />
                  </Button>
                </div>
                <div className="flex items-center gap-3">
                  <Button
                    type="button"
                    disabled={!firstPhoto}
                    onClick={() => firstPhoto && setSelectedPhoto({ asset, photo: firstPhoto })}
                    className="size-16 rounded-xl neu-btn bg-slate-950 overflow-hidden shrink-0 flex items-center justify-center disabled:cursor-default cursor-pointer"
                    aria-label={firstPhoto ? t("assets.viewPhotoAriaLabel", { name: asset.name }) : t("assets.noPhotoAriaLabel", { name: asset.name })}
                  >
                    {firstPhoto ? <img src={firstPhoto.thumbnailDataUrl} alt={asset.name} className="size-full object-cover" /> : <Icon className="size-7 text-slate-600" />}
                  </Button>
                  <div className="min-w-0 flex-1">
                    <p className="text-lg font-extrabold text-slate-100 tabular-nums leading-tight">{ev.source === "live" ? "≈ " : ""}{formatMoney(ev.value, asset.currency)}</p>
                    <p className="mt-1 text-[11px] text-slate-500 truncate">{label}{owner ? ` · ${owner.fullName}` : ""}</p>
                    <p className="text-[11px] text-slate-500 truncate">{isGoldType(asset.type) ? `${effectiveGoldWeight(asset)} ${asset.weightUnit || asset.unit}` : `${asset.quantity} ${asset.unit}`}</p>
                  </div>
                </div>
              </Reveal>
            );
          })}
          </Reveal>
        </section>
      )}

      <Reveal delay={0.06} className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4 xl:gap-6">
        <div className="bg-slate-900 neu-raised rounded-2xl p-4">
          <p className="text-[11px] text-slate-500">{t("assets.totalEstimatedValue")}</p>
          <p className="mt-1 text-xl font-extrabold text-slate-100 tabular-nums">{formatMoney(stats.totalVnd)}</p>
          {stats.totalUsd > 0 && <p className="text-xs font-bold text-slate-400 tabular-nums">+ {formatMoney(stats.totalUsd, "USD")}</p>}
        </div>
        <div className="bg-slate-900 neu-raised rounded-2xl p-4">
          <p className="text-[11px] text-slate-500">{t("assets.goldTotal")}</p>
          <p className="mt-1 text-lg font-extrabold text-amber-400 tabular-nums">{formatMoney(stats.goldVnd)}</p>
          {stats.goldUsd > 0 && <p className="text-xs font-bold text-amber-400/70 tabular-nums">+ {formatMoney(stats.goldUsd, "USD")}</p>}
        </div>
        <div className="bg-slate-900 neu-raised rounded-2xl p-4">
          <p className="text-[11px] text-slate-500">{t("assets.cryptoTotal")}</p>
          <p className="mt-1 text-lg font-extrabold text-sky-400 tabular-nums">{formatMoney(stats.cryptoVnd)}</p>
          {stats.cryptoUsd > 0 && <p className="text-xs font-bold text-sky-400/70 tabular-nums">+ {formatMoney(stats.cryptoUsd, "USD")}</p>}
        </div>
        <div className="bg-slate-900 neu-raised rounded-2xl p-4">
          <p className="text-[11px] text-slate-500">{t("assets.landTotal")}</p>
          <p className="mt-1 text-lg font-extrabold text-emerald-400 tabular-nums">{formatMoney(stats.landVnd)}</p>
          {stats.landUsd > 0 && <p className="text-xs font-bold text-emerald-400/70 tabular-nums">+ {formatMoney(stats.landUsd, "USD")}</p>}
        </div>
      </Reveal>

      <Reveal delay={0.12} className="relative overflow-hidden bg-slate-900 neu-raised rounded-2xl p-4 space-y-3">
        <ShimmerLine accent="emerald" />
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 size-4 text-slate-500" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t("assets.searchPlaceholder")}
              className="w-full pl-9 pr-3 py-2 bg-slate-950 neu-pressed-sm rounded-xl text-xs text-slate-200 outline-none focus:border-emerald-500"
            />
          </div>
          <Button
            type="button"
            onClick={openCreateForm}
            className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 px-4 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Plus className="size-4" /> {t("assets.addAssetButton")}
          </Button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px]">
          <div>
            <label className="text-slate-500 block mb-1">{t("assets.typeFilterLabel")}</label>
            <FancySelect
              value={typeFilter}
              onChange={(v) => setTypeFilter(v as AssetType | "all")}
              ariaLabel={t("assets.typeFilterLabel")}
              options={assetTypeFilterOptions}
            />
          </div>
          <div>
            <label className="text-slate-500 block mb-1">{t("assets.ownerFilterLabel")}</label>
            <FancySelect
              value={ownerFilter}
              onChange={setOwnerFilter}
              ariaLabel={t("assets.ownerFilterLabel")}
              options={[
                { value: "all", label: t("assets.ownerFilterAll") },
                { value: "", label: t("assets.ownerFilterUnassigned") },
                ...users.map(user => ({ value: user.id, label: user.fullName }))
              ]}
            />
          </div>
        </div>
      </Reveal>

      {filteredAssets.length === 0 ? (
        <div className="bg-slate-900/40 border border-dashed border-slate-800 rounded-2xl py-12 text-center space-y-3">
          <p className="text-sm text-slate-500">{t("assets.noAssetsMessage")}</p>
          <Button type="button" onClick={openCreateForm} className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 px-4 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer">
            <Plus className="size-4" /> {t("assets.addFirstAssetButton")}
          </Button>
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
                  <Button
                    type="button"
                    disabled={!firstPhoto}
                    onClick={() => firstPhoto && setSelectedPhoto({ asset, photo: firstPhoto })}
                    className="size-20 rounded-xl neu-btn bg-slate-950 overflow-hidden shrink-0 flex items-center justify-center disabled:cursor-default cursor-pointer"
                    aria-label={firstPhoto ? t("assets.viewPhotoAriaLabel", { name: asset.name }) : t("assets.noPhotoAriaLabel", { name: asset.name })}
                  >
                    {firstPhoto ? (
                      <img src={firstPhoto.thumbnailDataUrl} alt={asset.name} className="size-full object-cover" />
                    ) : (
                      <Icon className="size-8 text-slate-600" />
                    )}
                  </Button>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-lg border text-[10px] font-bold ${typeClass(asset.type)}`}>
                          {assetTypeLabel(asset.type)}
                        </span>
                        <h3 className="mt-1 text-sm font-bold text-slate-100 truncate">{asset.name}</h3>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {canManageAsset(asset) && (
                          <>
                            <Button type="button" onClick={() => handleTogglePin(asset)} aria-label={asset.isPinned ? t("assets.unpinAssetAriaLabel", { name: asset.name }) : t("assets.pinAssetAriaLabel", { name: asset.name })} className={`size-8 rounded-lg neu-btn flex items-center justify-center cursor-pointer ${asset.isPinned ? "bg-emerald-500/10 text-emerald-400" : "bg-slate-950 text-slate-500 hover:text-emerald-400"}`}>
                              <Pin className={`size-3.5 ${asset.isPinned ? "fill-current" : ""}`} />
                            </Button>
                            {onSaveTransaction && (
                            <Button type="button" onClick={() => openSellForm(asset)} aria-label={t("assets.sellAssetAriaLabel", { name: asset.name })} title={t("assets.sellAssetDialogTitle")} className="size-8 rounded-lg bg-slate-950 neu-btn text-slate-500 hover:text-emerald-400 flex items-center justify-center cursor-pointer">
                              <HandCoins className="size-3.5" />
                            </Button>
                            )}
                            <Button type="button" onClick={() => openEditForm(asset)} aria-label={t("assets.editAssetAriaLabel", { name: asset.name })} className="size-8 rounded-lg bg-slate-950 neu-btn text-slate-500 hover:text-amber-400 flex items-center justify-center cursor-pointer">
                              <Pencil className="size-3.5" />
                            </Button>
                            <Button type="button" onClick={() => handleDelete(asset)} aria-label={t("assets.deleteAssetAriaLabel", { name: asset.name })} className="size-8 rounded-lg bg-slate-950 neu-btn text-slate-500 hover:text-rose-400 flex items-center justify-center cursor-pointer">
                              <Trash2 className="size-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
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
                                {t("assets.purchasePriceBadge")}
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
                              {t("assets.capitalLabel")} {formatMoney(purchase, asset.currency)} ·{" "}
                              <span className={up ? "text-emerald-400" : "text-rose-400"}>
                                {up ? t("assets.profitLabel") : t("assets.lossLabel")} {formatMoney(Math.abs(diff), asset.currency)}
                              </span>
                            </p>
                          )}
                        </>
                      );
                    })()}
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
                      <span className="flex items-center gap-1"><UserIcon className="size-3" /> {owner ? owner.fullName : t("assets.sharedAsset")}</span>
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
                      <p className="bg-slate-950 neu-pressed-sm rounded-lg px-2.5 py-2 text-slate-400">{t("assets.symbolLabel")} <span className="text-sky-400 font-bold">{asset.symbol || "—"}</span></p>
                      <p className="bg-slate-950 neu-pressed-sm rounded-lg px-2.5 py-2 text-slate-400">{t("assets.networkLabel")} <span className="text-slate-200">{asset.network || "—"}</span></p>
                    </>
                  )}
                  {asset.type === "land" && (
                    <>
                      <p className="bg-slate-950 neu-pressed-sm rounded-lg px-2.5 py-2 text-slate-400">{t("assets.areaLabel")} <span className="text-emerald-400 font-bold tabular-nums">{asset.areaM2 ? `${asset.areaM2} m2` : "—"}</span></p>
                      <p className="bg-slate-950 neu-pressed-sm rounded-lg px-2.5 py-2 text-slate-400">{t("assets.certificateLabel")} <span className="text-slate-200">{asset.certificateNo || "—"}</span></p>
                    </>
                  )}
                  {isGoldType(asset.type) && (
                    <>
                      <p className="bg-slate-950 neu-pressed-sm rounded-lg px-2.5 py-2 text-slate-400">{t("assets.weightLabel")} <span className="text-amber-400 font-bold tabular-nums">{asset.weight ? `${asset.weight} ${asset.weightUnit || asset.unit}` : "—"}</span></p>
                      <p className="bg-slate-950 neu-pressed-sm rounded-lg px-2.5 py-2 text-slate-400">{t("assets.goldPurityCardLabel")} <span className="text-slate-200">{goldPurityLabel(asset.goldPurity)}</span></p>
                    </>
                  )}
                  {asset.type === "vehicle" && (
                    <>
                      <p className="bg-slate-950 neu-pressed-sm rounded-lg px-2.5 py-2 text-slate-400">{t("assets.brandLabel")} <span className="text-orange-400 font-bold">{asset.brand || "—"}</span></p>
                      <p className="bg-slate-950 neu-pressed-sm rounded-lg px-2.5 py-2 text-slate-400">{t("assets.serialLabel")} <span className="text-slate-200">{asset.serialNo || "—"}</span></p>
                    </>
                  )}
                  {asset.type === "stock" && (
                    <>
                      <p className="bg-slate-950 neu-pressed-sm rounded-lg px-2.5 py-2 text-slate-400">{t("assets.stockSymbolLabel")} <span className="text-violet-400 font-bold">{asset.symbol || "—"}</span></p>
                      <p className="bg-slate-950 neu-pressed-sm rounded-lg px-2.5 py-2 text-slate-400">{t("assets.stockExchangeLabel")} <span className="text-slate-200">{asset.brand || "—"}</span></p>
                    </>
                  )}
                </div>

                {(asset.notes || asset.photos?.length > 1) && (
                  <div className="pt-3 border-t border-slate-800 space-y-2">
                    {asset.notes && <p className="text-xs text-slate-500 line-clamp-2">{asset.notes}</p>}
                    {asset.photos?.length > 1 && (
                      <div className="flex flex-wrap gap-2">
                        {asset.photos.map(photo => (
                          <Button key={photo.id} type="button" onClick={() => setSelectedPhoto({ asset, photo })} className="size-10 rounded-lg neu-btn overflow-hidden bg-slate-950 cursor-pointer" aria-label={t("assets.viewPhotoButtonAriaLabel", { name: photo.fileName })}>
                            <img src={photo.thumbnailDataUrl} alt={photo.fileName} className="size-full object-cover" />
                          </Button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-[10px] text-slate-600">
                  <span>{t("assets.createdByLabel")} {creator ? creator.fullName : t("assets.sharedAsset")}</span>
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
            className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-5xl shadow-2xl max-h-[90vh] flex flex-col overflow-hidden outline-none"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 shrink-0">
              <h3 className="text-md font-bold text-slate-100">{editingAsset ? t("assets.editAssetTitle") : t("assets.addAssetTitle")}</h3>
              <Button type="button" onClick={closeForm} aria-label={t("assets.closeFormAriaLabel")} className="size-8 rounded-lg bg-slate-800 text-slate-400 hover:text-slate-200 flex items-center justify-center">
                <X className="size-4" />
              </Button>
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
                    <label className="text-slate-400 block font-semibold">{t("assets.formTypeLabel")}</label>
                    <FancySelect
                      value={formType}
                      onChange={(v) => handleTypeChange(v as AssetType)}
                      ariaLabel={t("assets.formTypeLabel")}
                      options={formTypeOptions}
                    />
                    {isCustomAssetType(formType) && (
                      <Input
                        value={formCustomTypeName}
                        onChange={(e) => handleCustomTypeNameChange(e.target.value)}
                        placeholder={t("assets.formCustomTypePlaceholder")}
                        className="w-full bg-slate-950 neu-pressed-sm rounded-lg p-2.5 text-slate-200 outline-none focus:border-cyan-500"
                      />
                    )}
                  </div>
                  <div className="space-y-1">
                    <label className="text-slate-400 block font-semibold">{t("assets.formNameLabel")} <span className="text-rose-400">*</span></label>
                    <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder={t("assets.formNamePlaceholder")} className="w-full bg-slate-950 neu-pressed-sm rounded-lg p-2.5 text-slate-200 outline-none focus:border-emerald-500" />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div className="space-y-1">
                    <label className="text-slate-400 block font-semibold">{t("assets.formOwnerLabel")}</label>
                    <FancySelect
                      value={formOwnerId}
                      onChange={setFormOwnerId}
                      ariaLabel={t("assets.formOwnerLabel")}
                      placeholder={t("assets.sharedAsset")}
                      options={[
                        { value: "", label: t("assets.sharedAsset") },
                        ...users.map(user => ({ value: user.id, label: user.fullName }))
                      ]}
                    />
                  </div>
                  {formType !== "land" && (
                    <>
                      <div className="space-y-1">
                        <label className="text-slate-400 block font-semibold">{isGoldType(formType) ? t("assets.formWeightLabel") : t("assets.formQuantityLabel")}</label>
                        <Input type="number" min="0" step="0.000001" value={formQuantity || ""} onChange={(e) => setFormQuantity(Number(e.target.value))} className="w-full bg-slate-950 neu-pressed-sm rounded-lg p-2.5 text-slate-200 outline-none" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-slate-400 block font-semibold">{t("assets.formUnitLabel")}</label>
                        {isGoldType(formType) ? (
                          <FancySelect
                            value={formUnit}
                            onChange={setFormUnit}
                            ariaLabel={t("assets.formUnitLabel")}
                            options={[
                              { value: "chỉ", label: "chỉ" },
                              { value: "lượng", label: "lượng" },
                              { value: "gram", label: "gram" }
                            ]}
                          />
                        ) : (
                          <Input value={formUnit} onChange={(e) => setFormUnit(e.target.value)} className="w-full bg-slate-950 neu-pressed-sm rounded-lg p-2.5 text-slate-200 outline-none" />
                        )}
                      </div>
                    </>
                  )}
                  <div className="space-y-1">
                    <label className="text-slate-400 block font-semibold">{t("assets.formCurrencyLabel")}</label>
                    <FancySelect
                      value={formCurrency}
                      onChange={(v) => setFormCurrency(v as "VND" | "USD")}
                      ariaLabel={t("assets.formCurrencyLabel")}
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
                      {t("assets.formEstimatedValueLabel")}
                      {formAutoValue && formEstimatedValue === 0 && (
                        <span className="ml-1.5 text-[9px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded-full">AUTO</span>
                      )}
                    </label>
                    <Input inputMode="numeric" value={formatMoneyInput(formEstimatedValue)} onChange={(e) => setFormEstimatedValue(parseMoneyInput(e.target.value))} className="w-full bg-slate-950 neu-pressed-sm rounded-lg p-2.5 text-slate-200 outline-none font-mono" />
                    {formAutoValue && (
                      <p className="text-[10px] text-emerald-400/70 flex items-center gap-1">
                        <TrendingUp className="size-3 shrink-0" />
                        ≈ {formatMoney(formAutoValue.value, formCurrency)}
                        <span className="text-slate-600">({formAutoValue.label})</span>
                        {formEstimatedValue === 0 && <span className="text-slate-500"> — {t("assets.autoValueHint")}</span>}
                      </p>
                    )}
                    {!formAutoValue && (isGoldType(formType) || formType === "crypto") && marketPrices && (
                      <p className="text-[10px] text-slate-600">
                        {isGoldType(formType)
                          ? t("assets.goldPriceHint")
                          : t("assets.cryptoPriceHint")}
                      </p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <label className="text-slate-400 block font-semibold">{t("assets.formPurchaseValueLabel")}</label>
                    <Input inputMode="numeric" value={formatMoneyInput(formPurchaseValue)} onChange={(e) => setFormPurchaseValue(parseMoneyInput(e.target.value))} className="w-full bg-slate-950 neu-pressed-sm rounded-lg p-2.5 text-slate-200 outline-none font-mono" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-slate-400 block font-semibold">{t("assets.formPurchaseDateLabel")}</label>
                    <DateInputDMY value={formPurchaseDate} onChange={setFormPurchaseDate} className="w-full bg-slate-950 neu-pressed-sm rounded-lg p-2.5 text-slate-200 outline-none font-mono" />
                  </div>
                </div>

                {formType === "crypto" && (
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-slate-950/40 neu-pressed-sm rounded-xl p-3">
                    <Input value={formSymbol} onChange={(e) => setFormSymbol(e.target.value.toUpperCase())} placeholder={t("assets.formCryptoSymbolPlaceholder")} className="bg-slate-950 neu-pressed-sm rounded-lg p-2.5 text-slate-200 outline-none" />
                    <Input value={formNetwork} onChange={(e) => setFormNetwork(e.target.value)} placeholder={t("assets.formNetworkPlaceholder")} className="bg-slate-950 neu-pressed-sm rounded-lg p-2.5 text-slate-200 outline-none" />
                    <Input value={formWalletLabel} onChange={(e) => setFormWalletLabel(e.target.value)} placeholder={t("assets.formWalletLabelPlaceholder")} className="bg-slate-950 neu-pressed-sm rounded-lg p-2.5 text-slate-200 outline-none" />
                    <Input value={formWalletAddressMasked} onChange={(e) => setFormWalletAddressMasked(e.target.value)} placeholder={t("assets.formWalletAddressPlaceholder")} className="bg-slate-950 neu-pressed-sm rounded-lg p-2.5 text-slate-200 outline-none" />
                    {marketPrices && formSymbol && marketPrices.crypto[formSymbol.toUpperCase()] && (
                      <div className="md:col-span-4 flex items-center gap-2 text-[10px] text-sky-400/80">
                        <TrendingUp className="size-3 shrink-0" />
                        {formSymbol}: <span className="font-bold">${marketPrices.crypto[formSymbol.toUpperCase()].usd.toLocaleString("en-US")}</span>
                        <span className="text-slate-600">≈ {formatMoney(Math.round(marketPrices.crypto[formSymbol.toUpperCase()].vnd))}</span>
                        <span className="text-slate-700">/ coin</span>
                      </div>
                    )}
                    {marketPrices && formSymbol && !marketPrices.crypto[formSymbol.toUpperCase()] && formSymbol.length >= 2 && (
                      <p className="md:col-span-4 text-[10px] text-slate-600">{t("assets.noPriceAvailable", { symbol: formSymbol })}</p>
                    )}
                  </div>
                )}

                {formType === "land" && (
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-slate-950/40 neu-pressed-sm rounded-xl p-3">
                    <Input value={formAddress} onChange={(e) => setFormAddress(e.target.value)} placeholder={t("assets.formAddressPlaceholder")} className="md:col-span-2 bg-slate-950 neu-pressed-sm rounded-lg p-2.5 text-slate-200 outline-none" />
                    <Input type="number" min="0" step="0.01" value={formAreaM2 || ""} onChange={(e) => setFormAreaM2(Number(e.target.value))} placeholder={t("assets.formAreaPlaceholder")} className="bg-slate-950 neu-pressed-sm rounded-lg p-2.5 text-slate-200 outline-none" />
                    <Input value={formCertificateNo} onChange={(e) => setFormCertificateNo(e.target.value)} placeholder={t("assets.formCertificatePlaceholder")} className="bg-slate-950 neu-pressed-sm rounded-lg p-2.5 text-slate-200 outline-none" />
                    <Input value={formParcelNo} onChange={(e) => setFormParcelNo(e.target.value)} placeholder={t("assets.formParcelPlaceholder")} className="md:col-span-2 bg-slate-950 neu-pressed-sm rounded-lg p-2.5 text-slate-200 outline-none" />
                  </div>
                )}

                {isGoldType(formType) && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-slate-950/40 neu-pressed-sm rounded-xl p-3">
                    <div className="flex items-center gap-1.5">
                      <FancySelect
                        value={normalizeGoldPurity(formGoldPurity)}
                        onChange={setFormGoldPurity}
                        ariaLabel={t("assets.formGoldPurityAriaLabel")}
                        placeholder={t("assets.formGoldPurityPlaceholder")}
                        className="flex-1 min-w-0"
                        options={[
                          { value: "", label: t("assets.formGoldPurityPlaceholder") },
                          ...GOLD_PURITY_OPTIONS.map(o => ({ value: o.value, label: `${o.label} (${Math.round(o.factor * 100)}%)` }))
                        ]}
                      />
                      <Button type="button" onClick={() => setShowGoldPurityInfo(true)} aria-label={t("assets.goldPurityInfoButtonTitle")} title={t("assets.goldPurityInfoButtonTitle")} className="shrink-0 size-9 rounded-lg bg-slate-800 border border-slate-700 text-amber-400 hover:bg-slate-700 flex items-center justify-center cursor-pointer">
                        <Info className="size-4" />
                      </Button>
                    </div>
                    <Input value={formBrand} onChange={(e) => setFormBrand(e.target.value)} placeholder={t("assets.formBrandPlaceholder")} className="bg-slate-950 neu-pressed-sm rounded-lg p-2.5 text-slate-200 outline-none" />
                    <Input value={formSerialNo} onChange={(e) => setFormSerialNo(e.target.value)} placeholder={t("assets.formSerialPlaceholder")} className="bg-slate-950 neu-pressed-sm rounded-lg p-2.5 text-slate-200 outline-none" />
                    {marketPrices?.gold && (
                      <div className="md:col-span-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-amber-400/80">
                        <span className="flex items-center gap-1"><TrendingUp className="size-3" /> {t("assets.referenceGoldPrice")}</span>
                        <span className="font-bold">{formatMoney(Math.round(marketPrices.gold.pricePerChiVnd))}/chỉ</span>
                        <span className="text-amber-400/50">· {formatMoney(Math.round(marketPrices.gold.pricePerLuongVnd))}/lượng</span>
                        <span className="text-amber-400/50">· {formatMoney(Math.round(marketPrices.gold.pricePerGramVnd))}/gram</span>
                        <span className="text-slate-500">{t("assets.goldPurityFormulaHint")}</span>
                      </div>
                    )}
                  </div>
                )}

                {formType === "vehicle" && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-slate-950/40 neu-pressed-sm rounded-xl p-3">
                    <Input value={formBrand} onChange={(e) => setFormBrand(e.target.value)} placeholder={t("assets.formVehicleBrandPlaceholder")} className="bg-slate-950 neu-pressed-sm rounded-lg p-2.5 text-slate-200 outline-none" />
                    <Input value={formSerialNo} onChange={(e) => setFormSerialNo(e.target.value)} placeholder={t("assets.formVehicleSerialPlaceholder")} className="bg-slate-950 neu-pressed-sm rounded-lg p-2.5 text-slate-200 outline-none" />
                  </div>
                )}

                {formType === "stock" && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-slate-950/40 neu-pressed-sm rounded-xl p-3">
                    <Input value={formSymbol} onChange={(e) => setFormSymbol(e.target.value.toUpperCase())} placeholder={t("assets.formStockSymbolPlaceholder")} className="bg-slate-950 neu-pressed-sm rounded-lg p-2.5 text-slate-200 outline-none" />
                    <Input value={formBrand} onChange={(e) => setFormBrand(e.target.value)} placeholder={t("assets.formStockExchangePlaceholder")} className="bg-slate-950 neu-pressed-sm rounded-lg p-2.5 text-slate-200 outline-none" />
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Input value={formLocation} onChange={(e) => setFormLocation(e.target.value)} placeholder={t("assets.formLocationPlaceholder")} className="bg-slate-950 neu-pressed-sm rounded-lg p-2.5 text-slate-200 outline-none" />
                  <Textarea rows={2} value={formNotes} onChange={(e) => setFormNotes(e.target.value)} placeholder={t("assets.formNotesPlaceholder")} className="bg-slate-950 neu-pressed-sm rounded-lg p-2.5 text-slate-200 outline-none" />
                </div>

                <div className="bg-slate-950/40 neu-pressed-sm rounded-xl p-3 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-bold text-slate-200 flex items-center gap-1.5"><ImageIcon className="size-4 text-sky-400" /> {t("assets.photosLabel")}</p>
                      <p className="text-[10px] text-slate-500">{t("assets.photosHint")}</p>
                    </div>
                    <label className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-slate-800 text-sky-400 hover:bg-slate-700 ${imageProcessing ? "opacity-60 cursor-wait pointer-events-none" : "cursor-pointer"}`}>
                      <Upload className="size-4" /> {imageProcessing ? t("assets.optimizingPhotos") : t("assets.uploadPhotosButton")}
                      <Input type="file" accept="image/*,.heic,.heif" multiple onChange={handlePhotoFiles} disabled={imageProcessing} className="hidden" />
                    </label>
                  </div>
                  {formPhotos.length > 0 && (
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                      {formPhotos.map(photo => (
                        <div key={photo.id} className="relative rounded-xl overflow-hidden neu-pressed-sm bg-slate-950 aspect-square">
                          <img src={photo.thumbnailDataUrl} alt={photo.fileName} className="size-full object-cover" />
                          <Button type="button" onClick={() => setFormPhotos(prev => prev.filter(p => p.id !== photo.id))} aria-label={t("assets.deletePhotoAriaLabel", { name: photo.fileName })} className="absolute right-1 top-1 size-6 rounded-lg bg-slate-950/90 text-slate-400 hover:text-rose-400 flex items-center justify-center">
                            <X className="size-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 px-5 py-4 border-t border-slate-800 shrink-0">
                <Button type="button" onClick={closeForm} disabled={imageProcessing} className="px-4 py-2 bg-slate-950 text-slate-400 hover:bg-slate-800 hover:text-slate-200 rounded-xl font-bold disabled:opacity-50">
                  {t("assets.closeFormButton")}
                </Button>
                <Button type="submit" disabled={imageProcessing} className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl font-bold disabled:opacity-50">
                  {editingAsset ? t("assets.saveChangesButton") : t("assets.saveAssetButton")}
                </Button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {selectedPhoto && (
        <div onClick={() => setSelectedPhoto(null)} className="fixed inset-0 bg-slate-950/90 flex items-center justify-center z-50 p-4" id="asset-photo-viewer">
          <div ref={photoRef} tabIndex={-1} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={t("assets.addAssetTitle")} className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col outline-none">
            <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-100 truncate">{selectedPhoto.asset.name}</p>
                <p className="text-[11px] text-slate-500 tabular-nums">{selectedPhoto.photo.width}x{selectedPhoto.photo.height} • {selectedPhoto.photo.sizeKb}KB</p>
              </div>
              <Button type="button" onClick={() => setSelectedPhoto(null)} aria-label={t("assets.closePhotoAriaLabel")} className="size-8 rounded-lg bg-slate-800 text-slate-400 hover:text-slate-200 flex items-center justify-center shrink-0">
                <X className="size-4" />
              </Button>
            </div>
            <div className="min-h-0 flex-1 bg-slate-950 flex items-center justify-center p-3">
              <img src={selectedPhoto.photo.fullDataUrl} alt={selectedPhoto.photo.fileName} className="max-h-[72vh] max-w-full object-contain rounded-lg" />
            </div>
          </div>
        </div>
      )}

      {showGoldPurityInfo && (
        <div onClick={() => setShowGoldPurityInfo(false)} className="fixed inset-0 bg-slate-950/90 flex items-center justify-center z-50 p-4" id="gold-purity-info">
          <div ref={goldInfoRef} tabIndex={-1} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col outline-none">
            <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between gap-3">
              <p className="text-sm font-bold text-slate-100 flex items-center gap-1.5"><Gem className="size-4 text-amber-400" /> {t("assets.goldPurityInfoTitle")}</p>
              <Button type="button" onClick={() => setShowGoldPurityInfo(false)} aria-label={t("common.close")} className="size-8 rounded-lg bg-slate-800 text-slate-400 hover:text-slate-200 flex items-center justify-center shrink-0">
                <X className="size-4" />
              </Button>
            </div>
            <div className="overflow-y-auto p-4 space-y-3">
              <p className="text-[11px] text-slate-400 leading-relaxed">
                {t("assets.goldValueFormula").split(t("assets.goldValueFormula")).length > 0
                  ? <>Giá trị vàng ước tính theo công thức: <span className="text-amber-400 font-semibold">{t("assets.goldValueFormula")}</span>. {t("assets.goldPurityExplanation")}</>
                  : t("assets.goldPurityExplanation")}
              </p>
              <table className="w-full text-[11px] tabular-nums">
                <thead>
                  <tr className="text-slate-500 border-b border-slate-800">
                    <th className="text-left font-semibold py-1.5">{t("assets.goldPurityTableHeader")}</th>
                    <th className="text-right font-semibold py-1.5">{t("assets.goldContentTableHeader")}</th>
                    <th className="text-right font-semibold py-1.5">{t("assets.goldFactorTableHeader")}</th>
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
                {t("assets.goldMarketReference")} {t("assets.goldEstimateHint")}
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
            className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] flex flex-col overflow-hidden outline-none"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 shrink-0">
              <h3 className="text-md font-bold text-slate-100 flex items-center gap-1.5">
                <HandCoins className="size-5 text-emerald-400" /> {t("assets.sellAssetDialogTitle")}
              </h3>
              <Button type="button" onClick={closeSell} disabled={selling} aria-label={t("common.close")} className="size-8 rounded-lg bg-slate-800 text-slate-400 hover:text-slate-200 flex items-center justify-center disabled:opacity-50">
                <X className="size-4" />
              </Button>
            </div>

            <div className="space-y-4 overflow-y-auto px-5 py-4 flex-1 min-h-0 text-xs">
              {sellError && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl font-medium">{sellError}</div>
              )}

              <div className="bg-slate-950/50 neu-pressed-sm rounded-xl p-3">
                <p className="text-[11px] text-slate-500">{t("assets.sellAssetLabel")}</p>
                <p className="text-sm font-bold text-slate-100 truncate">{sellingAsset.name}</p>
                <p className="mt-1 text-[11px] text-slate-500">
                  {t("assets.estimatedValueLabel")}{" "}
                  <span className="text-emerald-400 font-bold">{sellEstimate > 0 ? formatMoney(sellEstimate, sellingAsset.currency) : t("assets.undefinedValue")}</span>
                </p>
              </div>

              {/* Chọn cách định giá bán */}
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  onClick={() => handleSellModeChange("estimate")}
                  disabled={sellEstimate <= 0}
                  className={`px-3 py-2.5 rounded-xl font-bold border transition-all ${sellMode === "estimate" ? "bg-emerald-500 text-slate-950 border-emerald-500" : "bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200"} disabled:opacity-40 disabled:cursor-not-allowed`}
                >
                  {t("assets.sellByEstimate")}
                </Button>
                <Button
                  type="button"
                  onClick={() => handleSellModeChange("custom")}
                  className={`px-3 py-2.5 rounded-xl font-bold border transition-all ${sellMode === "custom" ? "bg-emerald-500 text-slate-950 border-emerald-500" : "bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200"}`}
                >
                  {t("assets.sellCustomPrice")}
                </Button>
              </div>

              <div className="space-y-1">
                <label className="text-slate-400 block font-semibold">{t("assets.actualSellPriceLabel", { currency: sellingAsset.currency })}</label>
                <Input
                  inputMode="numeric"
                  value={formatMoneyInput(sellPrice)}
                  onChange={(e) => { setSellMode("custom"); setSellPrice(parseMoneyInput(e.target.value)); }}
                  className="w-full bg-slate-950 neu-pressed-sm rounded-lg p-2.5 text-slate-200 outline-none focus:border-emerald-500 font-mono text-base font-bold"
                />
                {sellingAsset.currency === "USD" && sellPrice > 0 && (
                  <p className="text-[10px] text-slate-500">
                    ≈ {formatMoney(Math.round(sellPrice * (marketPrices?.usdVndRate || 25000)))} ({t("assets.convertByRate")} {(marketPrices?.usdVndRate || 25000).toLocaleString("vi-VN")}đ/USD)
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
                      {t("assets.comparePurchasePrice")} {formatMoney(purchase, sellingAsset.currency)}: {up ? t("assets.profitLabel") : t("assets.lossLabel")} {formatMoney(Math.abs(diff), sellingAsset.currency)} ({up ? "+" : "−"}{Math.abs(pct).toFixed(1)}%)
                    </p>
                  );
                })()}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-slate-400 block font-semibold">{t("assets.accountLabel")}</label>
                  <FancySelect
                    value={sellAccount}
                    onChange={(v) => setSellAccount(v as AccountType)}
                    ariaLabel={t("assets.accountLabel")}
                    options={SELL_ACCOUNTS}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-slate-400 block font-semibold">{t("assets.sellDateLabel")}</label>
                  <DateInputDMY value={sellDate} onChange={setSellDate} className="w-full bg-slate-950 neu-pressed-sm rounded-lg p-2.5 text-slate-200 outline-none font-mono" />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-slate-400 block font-semibold">{t("assets.sellNoteLabel")}</label>
                <Input value={sellNote} onChange={(e) => setSellNote(e.target.value)} placeholder={t("assets.sellNotePlaceholder")} className="w-full bg-slate-950 neu-pressed-sm rounded-lg p-2.5 text-slate-200 outline-none focus:border-emerald-500" />
              </div>

              <p className="text-[10px] text-slate-500 leading-relaxed">
                {t("assets.sellConfirmPrefix")} <span className="text-emerald-400 font-semibold">{t("assets.incomeLabel")}</span> {t("assets.sellConfirmSuffix", { category: ASSET_SALE_CATEGORY })}
              </p>
            </div>

            <div className="flex items-center justify-end gap-2.5 px-5 py-4 border-t border-slate-800 shrink-0">
              <Button type="button" onClick={closeSell} disabled={selling} className="px-4 py-2 bg-slate-950 text-slate-400 hover:bg-slate-800 hover:text-slate-200 rounded-xl font-bold disabled:opacity-50">
                {t("common.cancel")}
              </Button>
              <Button type="button" onClick={handleConfirmSell} disabled={selling || sellPrice <= 0} className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl font-bold disabled:opacity-50 flex items-center gap-1.5">
                <HandCoins className="size-4" /> {selling ? t("assets.processingLabel") : t("assets.confirmSellButton")}
              </Button>
            </div>
          </motion.div>
        </div>
      )}

      {ConfirmDialog}
    </div>
  );
}
