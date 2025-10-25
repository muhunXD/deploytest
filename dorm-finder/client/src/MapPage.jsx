import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMap,
  useMapEvents,
  ZoomControl,
  Polyline,
  CircleMarker,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./leaflet-setup"; // fixes Leaflet default icons
import "./MapPage.css";
import { fetchDorms, fetchPois } from "./api";
// Sidebar icon
import dormIcon from "./assets/dorm.png";
import sevenIcon from "./assets/seven.png";
import pharmacyIcon from "./assets/pharmacy.png";
import restaurantIcon from "./assets/restaurant.png";
import laundryIcon from "./assets/laundry.png";
import beerIcon from "./assets/beer.png";
import motorbikeIcon from "./assets/motorbike.png";
import printerIcon from "./assets/printer.png";
import atmIcon from "./assets/atm.png";
import barberIcon from "./assets/barber.png";
// Normalize image URLs coming from server (GitHub blob -> raw)
const normalizeImageUrl = (url) => {
  if (!url || typeof url !== "string") return null;
  const s = url.trim();
  if (!s) return null;
  if (s.includes("raw.githubusercontent.com")) return s;
  if (s.includes("github.com/") && s.includes("/blob/")) {
    try {
      const u = new URL(s);
      const parts = u.pathname.split("/").filter(Boolean); // [owner, repo, 'blob', branch, ...path]
      const blobIdx = parts.indexOf("blob");
      if (blobIdx > 1 && blobIdx < parts.length - 1) {
        const owner = parts[0];
        const repo = parts[1];
        const branch = parts[blobIdx + 1];
        const rest = parts.slice(blobIdx + 2).join("/");
        return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${rest}`;
      }
      // Fallback: GitHub supports ?raw=1
      return s.includes("?raw=1") ? s : `${s}?raw=1`;
    } catch {
      return s;
    }
  }
  return s;
};
// Pick first available dorm image URL (array or string)
const collectImageUrls = (input, addUrl) => {
  if (!input) return;
  if (Array.isArray(input)) {
    input.forEach((item) => collectImageUrls(item, addUrl));
    return;
  }
  if (typeof input === "string") {
    const normalized = normalizeImageUrl(input);
    if (normalized) addUrl(normalized);
  }
};
const getDormImageUrls = (dorm) => {
  const collected = [];
  const seen = new Set();
  const addUrl = (url) => {
    const trimmed = typeof url === "string" ? url.trim() : "";
    if (!trimmed) return;
    if (seen.has(trimmed)) return;
    seen.add(trimmed);
    collected.push(trimmed);
  };
  collectImageUrls(dorm?.imageUrl, addUrl);
  collectImageUrls(dorm?.imageUrls, addUrl);
  collectImageUrls(dorm?.images, addUrl);
  collectImageUrls(dorm?.gallery, addUrl);
  collectImageUrls(dorm?.photos, addUrl);
  collectImageUrls(dorm?.image, addUrl);
  return collected;
};
const getPoiImageUrls = (poi) => {
  const collected = [];
  const seen = new Set();
  const addUrl = (url) => {
    const trimmed = typeof url === "string" ? url.trim() : "";
    if (!trimmed) return;
    if (seen.has(trimmed)) return;
    seen.add(trimmed);
    collected.push(trimmed);
  };
  collectImageUrls(poi?.imageUrl, addUrl);
  collectImageUrls(poi?.imageUrls, addUrl);
  collectImageUrls(poi?.images, addUrl);
  collectImageUrls(poi?.photos, addUrl);
  collectImageUrls(poi?.gallery, addUrl);
  collectImageUrls(poi?.image, addUrl);
  return collected;
};
const FILTER_BUTTONS = [
  { key: "dorm", label: "หอพัก", icon: dormIcon },
  { key: "seven", label: "7-11", icon: sevenIcon },
  { key: "pharmacy", label: "ร้านขายยา", icon: pharmacyIcon },
  { key: "food", label: "ร้านอาหาร", icon: restaurantIcon },
  { key: "laundry", label: "ร้านซักผ้า", icon: laundryIcon },
  { key: "bar", label: "ร้านเหล้า", icon: beerIcon },
  { key: "bike", label: "วินมอเตอร์ไซค์", icon: motorbikeIcon },
  { key: "printer", label: "ร้านถ่ายเอกสาร", icon: printerIcon },
  { key: "atm", label: "ตู้ ATM", icon: atmIcon },
  { key: "barber", label: "ร้านตัดผม", icon: barberIcon },
];
const CATEGORY_LABELS = FILTER_BUTTONS.reduce((acc, item) => {
  acc[item.key] = item.label;
  return acc;
}, {});
const ALL_FILTER_KEYS = FILTER_BUTTONS.map((item) => item.key);
const POI_FILTER_KEYS = ALL_FILTER_KEYS.filter((key) => key !== "dorm");
const VIEWER_MAX_WIDTH = 1040;
const VIEWER_MAX_HEIGHT = 700;
const VIEWER_MIN_WIDTH = 360;
const VIEWER_MIN_HEIGHT = 260;
const VIEWER_MARGIN_X = 200;
const VIEWER_MARGIN_Y = 240;
const computeViewerBounds = () => {
  if (typeof window === "undefined") {
    return { width: VIEWER_MAX_WIDTH, height: VIEWER_MAX_HEIGHT };
  }
  const availableWidth = Math.max(
    window.innerWidth - VIEWER_MARGIN_X,
    VIEWER_MIN_WIDTH,
  );
  const availableHeight = Math.max(
    window.innerHeight - VIEWER_MARGIN_Y,
    VIEWER_MIN_HEIGHT,
  );
  return {
    width: Math.min(VIEWER_MAX_WIDTH, availableWidth),
    height: Math.min(VIEWER_MAX_HEIGHT, availableHeight),
  };
};
const BoundsWatcher = ({ onBounds }) => {
  const map = useMap();
  useEffect(() => {
    const emit = () => {
      const b = map.getBounds();
      onBounds?.({
        north: b.getNorth(),
        south: b.getSouth(),
        east: b.getEast(),
        west: b.getWest(),
      });
    };
    emit();
    map.on("moveend", emit);
    return () => map.off("moveend", emit);
  }, [map, onBounds]);
  return null;
};
// Optional: prevent panning outside target area
const LockToBounds = ({ bounds, locked, offset = null }) => {
  const map = useMap();
  const storedMinZoomRef = useRef(null);
  useEffect(() => {
    if (!map || !bounds) return () => {};
    const paddedBounds = bounds.pad(0.02);
    if (locked) {
      if (storedMinZoomRef.current == null) {
        storedMinZoomRef.current = map.getMinZoom
          ? map.getMinZoom()
          : (map.options.minZoom ?? 0);
      }
      map.fitBounds(paddedBounds, { animate: false, padding: [20, 20] });
      const maxZoom = map.getMaxZoom
        ? map.getMaxZoom()
        : (map.options.maxZoom ?? 19);
      let lockedZoom = map.getZoom ? map.getZoom() : null;
      if (typeof lockedZoom === "number" && Number.isFinite(lockedZoom)) {
        const desiredZoom = Math.min(maxZoom, lockedZoom + 1);
        if (desiredZoom !== lockedZoom) {
          map.setZoom(desiredZoom);
          map.panInsideBounds(paddedBounds);
          lockedZoom = desiredZoom;
        }
        map.setMinZoom(lockedZoom);
      }
      map.setMaxBounds(paddedBounds);
      if (offset && typeof offset.x === "number" && typeof offset.y === "number") {
        requestAnimationFrame(() => {
          map.panBy(offset, { animate: false });
        });
      }
      return () => {
        if (storedMinZoomRef.current != null) {
          map.setMinZoom(storedMinZoomRef.current);
          storedMinZoomRef.current = null;
        }
        map.setMaxBounds(null);
      };
    }
    if (storedMinZoomRef.current != null) {
      map.setMinZoom(storedMinZoomRef.current);
      storedMinZoomRef.current = null;
    }
    map.setMaxBounds(null);
    return () => {};
  }, [map, bounds, locked, offset]);
  return null;
};
const MapMoveWatcher = ({ openPopupRef }) => {
  const map = useMapEvents({
    moveend() {
      const current = openPopupRef?.current;
      if (
        current &&
        current.latlng &&
        map.getBounds &&
        !map.getBounds().contains(current.latlng)
      ) {
        map.closePopup();
        if (openPopupRef) {
          openPopupRef.current = null;
        }
      }
    },
  });
  return null;
};
// Image-based POI icons
const makePoiIcon = (iconUrl, framed = true) =>
  L.divIcon({
    className: "",
    html: `<div class="map-poi-icon${framed ? "" : " no-frame"}"><img src="${iconUrl}" alt="" /></div>`,
    iconSize: [32, 36],
    iconAnchor: [16, 30],
    popupAnchor: [0, -26],
  });
const poiImgIcons = {
  seven: makePoiIcon(sevenIcon, false),
  pharmacy: makePoiIcon(pharmacyIcon),
  food: makePoiIcon(restaurantIcon),
  laundry: makePoiIcon(laundryIcon),
  bar: makePoiIcon(beerIcon),
  bike: makePoiIcon(motorbikeIcon),
  printer: makePoiIcon(printerIcon),
  atm: makePoiIcon(atmIcon),
  barber: makePoiIcon(barberIcon),
};
const PRICE_WIGGLE = 500; // baht
const DISTANCE_WIGGLE_METERS = 100;
const CAMPUS_COORDINATES = [13.819918, 100.514497];
// Approximate location of the KMUTNB rear gate on the campus side
const BACK_GATE_COORDINATES = [13.82185, 100.51433];
const ROUTE_SNAP_RADIUS_METERS = 120;
const MAP_MAX_ZOOM = 20;
const MAP_VIEW_OFFSET = L.point(-420, 0);
const FEATURE_PRESETS = [
  { key: "wifi", label: "Wi-Fi", icon: "📶" },
  { key: "parking", label: "ที่จอดรถ", icon: "🅿️" },
  { key: "air", label: "เครื่องปรับอากาศ", icon: "❄️" },
  { key: "laundry", label: "เครื่องซักผ้า", icon: "🧺" },
  { key: "fitness", label: "ฟิตเนส", icon: "🏋️" },
];
const FEATURE_ICON_LOOKUP = FEATURE_PRESETS.reduce((acc, feature) => {
  acc[feature.key] = feature.icon;
  return acc;
}, {});
const AMENITY_FILTER_OPTIONS = [
  { key: "wifi", label: "Wi-Fi", icon: FEATURE_ICON_LOOKUP.wifi || "Wi" },
  {
    key: "air",
    label: "เครื่องปรับอากาศ",
    icon: FEATURE_ICON_LOOKUP.air || "AC",
  },
  {
    key: "laundry",
    label: "เครื่องซักผ้า",
    icon: FEATURE_ICON_LOOKUP.laundry || "Ln",
  },
  {
    key: "fitness",
    label: "Fitness",
    icon: FEATURE_ICON_LOOKUP.fitness || "Ft",
  },
  {
    key: "parking",
    label: "ที่จอดรถ",
    icon: FEATURE_ICON_LOOKUP.parking || "Pk",
  },
];
const extractPriceRange = (dorm) => {
  const price = dorm?.price;
  if (!price) return null;
  const { min, max, currency = "THB" } = price;
  const toNumber = (value) => {
    if (value == null) return null;
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const minVal = toNumber(min);
  const maxVal = toNumber(max);
  if (minVal == null && maxVal == null) return null;
  const avg =
    minVal != null && maxVal != null
      ? (minVal + maxVal) / 2
      : (minVal ?? maxVal ?? null);
  return { min: minVal ?? null, max: maxVal ?? null, avg, currency };
};
const formatRangeText = (range, options = {}) => {
  if (!range) return "N/A";
  const { includePeriod = true } = options;
  const { min, max, currency } = range;
  const normalizedCurrency =
    typeof currency === "string" ? currency.trim() : "";
  const isThb =
    normalizedCurrency.toUpperCase() === "THB" || normalizedCurrency === "฿";
  const displayCurrency = isThb ? "บาท" : normalizedCurrency;
  const suffix = includePeriod ? (isThb ? "/เดือน" : "/month") : "";
  const unitText = displayCurrency ? ` ${displayCurrency}` : "";
  const fmt = (value) =>
    typeof value === "number" ? value.toLocaleString() : (value ?? "");
  if (min != null && max != null)
    return `${fmt(min)}-${fmt(max)}${unitText}${suffix}`;
  const single = min ?? max;
  if (single != null) return `${fmt(single)}${unitText}${suffix}`;
  return "N/A";
};
const formatDiffText = (value, currency) => {
  if (value == null) return null;
  const prefix = value > 0 ? "+" : value < 0 ? "-" : "";
  const amount = Math.abs(value).toLocaleString();
  return `${prefix}${amount} ${currency}`;
};
const buildPriceProfile = (range) => {
  if (!range) return { type: "none", small: null, big: null };
  const values = [];
  if (typeof range.min === "number") values.push(range.min);
  if (typeof range.max === "number") values.push(range.max);
  const normalized = values.filter((value) => Number.isFinite(value));
  if (normalized.length >= 2) {
    const [first, second] = normalized.sort((a, b) => a - b);
    return { type: "dual", small: first, big: second };
  }
  if (normalized.length === 1) {
    return { type: "single", small: normalized[0], big: normalized[0] };
  }
  return { type: "none", small: null, big: null };
};
const normalizeAmenityList = (values) => {
  if (!Array.isArray(values)) return [];
  return values
    .map((item) => (typeof item === "string" ? item.trim().toLowerCase() : ""))
    .filter(Boolean);
};
const extractDistanceValueAndUnit = (value, unitHint) => {
  if (value == null) return null;
  const normalizedHint =
    typeof unitHint === "string" ? unitHint.trim().toLowerCase() : null;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    return { value, unit: normalizedHint };
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const sanitized = trimmed.replace(/,/g, "");
    const match = sanitized.match(/^([0-9]+(?:\.[0-9]+)?)\s*([a-zA-Z]+)/);
    if (match) {
      const numeric = Number(match[1]);
      if (!Number.isFinite(numeric)) return null;
      const unit = match[2] ? match[2].toLowerCase() : normalizedHint;
      return { value: numeric, unit: unit || normalizedHint };
    }
    const numeric = Number(sanitized);
    if (Number.isFinite(numeric)) {
      return { value: numeric, unit: normalizedHint };
    }
  }
  return null;
};
const convertDistanceUnitToMeters = (value, unit) => {
  if (!Number.isFinite(value)) return null;
  const normalizedUnit = unit ? unit.trim().toLowerCase() : "";
  if (
    normalizedUnit === "" ||
    normalizedUnit === "m" ||
    normalizedUnit === "meter" ||
    normalizedUnit === "meters" ||
    normalizedUnit === "metre" ||
    normalizedUnit === "metres"
  ) {
    return value;
  }
  if (
    normalizedUnit === "km" ||
    normalizedUnit === "kilometer" ||
    normalizedUnit === "kilometers" ||
    normalizedUnit === "kilometre" ||
    normalizedUnit === "kilometres"
  ) {
    return value * 1000;
  }
  if (
    normalizedUnit === "mi" ||
    normalizedUnit === "mile" ||
    normalizedUnit === "miles"
  ) {
    return value * 1609.34;
  }
  if (
    normalizedUnit === "ft" ||
    normalizedUnit === "foot" ||
    normalizedUnit === "feet"
  ) {
    return value * 0.3048;
  }
  if (
    normalizedUnit === "yd" ||
    normalizedUnit === "yard" ||
    normalizedUnit === "yards"
  ) {
    return value * 0.9144;
  }
  return value;
};
const normalizeDistanceEntry = (entry, defaultUnit) => {
  if (entry == null) return null;
  const attempt = extractDistanceValueAndUnit(entry, defaultUnit);
  if (attempt) {
    const meters = convertDistanceUnitToMeters(attempt.value, attempt.unit);
    if (meters != null) return meters;
  }
  if (typeof entry === "object" && !Array.isArray(entry)) {
    const fallbackUnit =
      typeof entry.unit === "string"
        ? entry.unit
        : typeof entry.units === "string"
        ? entry.units
        : typeof entry.measure === "string"
        ? entry.measure
        : typeof entry.metric === "string"
        ? entry.metric
        : defaultUnit;
    const candidates = [
      { value: entry.meters ?? entry.m, unit: "m" },
      { value: entry.kilometers ?? entry.km, unit: "km" },
      { value: entry.value, unit: fallbackUnit },
      { value: entry.distance, unit: fallbackUnit },
      { value: entry.amount, unit: fallbackUnit },
      { value: entry.length, unit: fallbackUnit },
    ];
    for (const candidate of candidates) {
      if (candidate.value == null) continue;
      const meters = normalizeDistanceEntry(candidate.value, candidate.unit);
      if (meters != null) return meters;
    }
  }
  return null;
};
const getDormDistanceMetersFromMetadata = (dorm) => {
  const sources = [
    dorm?.distance?.toUniversity,
    dorm?.distance?.university,
    dorm?.distance?.campus,
    dorm?.distance,
    dorm?.distanceToUniversity,
    dorm?.distance_to_university,
    dorm?.distanceMeters,
    dorm?.distance_meters,
    dorm?.distanceInMeters,
  ];
  for (const source of sources) {
    const meters = normalizeDistanceEntry(source);
    if (meters != null && Number.isFinite(meters)) {
      return meters;
    }
  }
  return null;
};
const computeDormDistanceMeters = (dorm) => {
  const storedMeters = getDormDistanceMetersFromMetadata(dorm);
  if (storedMeters != null) return storedMeters;
  const coords = dorm?.location?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  try {
    const dormLatLng = L.latLng(coords[1], coords[0]);
    const campusLatLng = L.latLng(CAMPUS_COORDINATES[0], CAMPUS_COORDINATES[1]);
    const meters = dormLatLng.distanceTo(campusLatLng);
    return Number.isFinite(meters) ? meters : null;
  } catch {
    return null;
  }
};
const getDormRouteIdentifier = (dorm) => {
  if (!dorm) return null;
  if (dorm?._id) return dorm._id;
  const coords = dorm?.location?.coordinates;
  if (Array.isArray(coords) && coords.length >= 2) {
    return `${coords[0]},${coords[1]}`;
  }
  return null;
};
const EMPTY_ROUTE_STATE = {
  active: false,
  dormId: null,
  points: [],
  distance: null,
  duration: null,
  loading: false,
  error: null,
};
function SidebarSection({ title, open, onToggle, children }) {
  return (
    <section className={`sidebar-section${open ? " open" : ""}`}>
      <button
        type="button"
        className="sidebar-section-toggle"
        onClick={onToggle}
        aria-expanded={open}
      >
        <span className="sidebar-section-title">{title}</span>
        <span className="sidebar-section-chevron" aria-hidden="true">
          <svg viewBox="0 0 20 20" focusable="false">
            <path
              d="M7.5 5.5l5 4.5-5 4.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </button>
      <div className="sidebar-section-body" aria-hidden={!open}>
        {children}
      </div>
    </section>
  );
}
function Sidebar({
  open,
  onClose,
  q,
  onQueryChange,
  activeCategories,
  onToggleCategory,
  suggestions,
  suggestionsVisible,
  onSuggestionSelect,
  onSearchFocusChange,
  priceFilter,
  onPriceFilterChange,
  distanceFilter,
  onDistanceFilterChange,
  amenityFilter,
  onToggleAmenity,
  onResetFilters,
  filtersActive,
  resetSignal,
}) {
  const [openSections, setOpenSections] = useState(() => ({
    place: false,
    price: false,
    distance: false,
    amenities: false,
  }));
  useEffect(() => {
    setOpenSections({
      place: false,
      price: false,
      distance: false,
      amenities: false,
    });
  }, [resetSignal]);
  const handleSectionToggle = useCallback((key) => {
    setOpenSections((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      if (key !== "place" && !prev[key]) {
        next.place = false;
      }
      if (key === "place" && !prev[key]) {
        next.price = false;
        next.distance = false;
        next.amenities = false;
      }
      return next;
    });
  }, []);
  const handlePriceChange = useCallback(
    (field, value) => {
      onPriceFilterChange?.(field, value);
    },
    [onPriceFilterChange],
  );
  const handleDistanceChange = useCallback(
    (value) => {
      if (value === "" || value == null) {
        onDistanceFilterChange?.("");
        return;
      }
      const parsed = Number(value);
      if (!Number.isFinite(parsed)) return;
      const clamped = Math.max(0, Math.min(4000, parsed));
      onDistanceFilterChange?.(String(clamped));
    },
    [onDistanceFilterChange],
  );
  const sliderDistanceValue = useMemo(() => {
    const parsed = Number(distanceFilter);
    if (!Number.isFinite(parsed) || parsed < 0) return 0;
    return Math.min(parsed, 4000);
  }, [distanceFilter]);
  const priceMinValue = priceFilter?.min ?? "";
  const priceMaxValue = priceFilter?.max ?? "";
  return (
    <aside
      className={`sidebar-panel${open ? " open" : ""}`}
      aria-hidden={!open}
    >
      <div className="sidebar-top">
        <div className="sidebar-title">Dorm-Finder</div>
        <button
          type="button"
          className="sidebar-back-button"
          onClick={onClose}
          aria-label="Close sidebar"
        >
          <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
            <path
              d="M15 6l-6 6 6 6"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
      <div className="sidebar-search" role="search">
        <div className="sidebar-search-field">
          <span className="sidebar-search-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false">
              <circle
                cx="11"
                cy="11"
                r="6"
                stroke="currentColor"
                strokeWidth="2"
                fill="none"
              />
              <path
                d="m20 20-3.5-3.5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </span>
          <input
            type="text"
            placeholder="Search"
            value={q}
            onChange={(event) => onQueryChange?.(event.target.value)}
            className="sidebar-search-input"
            onFocus={() => onSearchFocusChange?.(true)}
            onBlur={() => onSearchFocusChange?.(false)}
          />
        </div>
        <SearchSuggestionList
          items={suggestions}
          visible={suggestionsVisible}
          onSelect={onSuggestionSelect}
          variant="sidebar"
        />
      </div>
      <nav className="sidebar-menu" aria-label="Filters">
        <SidebarSection
          title="หอพัก & สถานที่"
          open={openSections.place}
          onToggle={() => handleSectionToggle("place")}
        >
          <div className="sidebar-section-list">
            {FILTER_BUTTONS.map((category) => {
              const isActive = activeCategories?.has?.(category.key);
              return (
                <button
                  key={category.key}
                  type="button"
                  className={`menu-item${isActive ? " active" : ""}`}
                  title={category.label}
                  onClick={() => onToggleCategory?.(category.key)}
                  aria-pressed={Boolean(isActive)}
                >
                  <img src={category.icon} alt="" className="menu-item-icon" />
                  <span className="menu-item-label">{category.label}</span>
                </button>
              );
            })}
          </div>
        </SidebarSection>
        <SidebarSection
          title="ช่วงราคา"
          open={openSections.price}
          onToggle={() => handleSectionToggle("price")}
        >
          <div className="sidebar-section-form">
            <div className="sidebar-input-group">
              <label className="sidebar-field-label" htmlFor="price-min-input">
                Minimum price
              </label>
              <input
                id="price-min-input"
                type="number"
                inputMode="numeric"
                className="sidebar-input"
                placeholder="Min (THB)"
                min="0"
                value={priceMinValue}
                onChange={(event) =>
                  handlePriceChange("min", event.target.value)
                }
              />
            </div>
            <div className="sidebar-input-group">
              <label className="sidebar-field-label" htmlFor="price-max-input">
                Maximum price
              </label>
              <input
                id="price-max-input"
                type="number"
                inputMode="numeric"
                className="sidebar-input"
                placeholder="Max (THB)"
                min="0"
                value={priceMaxValue}
                onChange={(event) =>
                  handlePriceChange("max", event.target.value)
                }
              />
            </div>
            <p className="sidebar-hint">
              Results include +/- 500 THB tolerance.
            </p>
          </div>
        </SidebarSection>
        <SidebarSection
          title="ระยะทาง"
          open={openSections.distance}
          onToggle={() => handleSectionToggle("distance")}
        >
          <div className="sidebar-section-form">
            <div className="sidebar-input-group">
              <label
                className="sidebar-field-label"
                htmlFor="distance-range-input"
              >
                Distance (m)
              </label>
              <input
                id="distance-range-input"
                type="number"
                inputMode="numeric"
                min="0"
                max="4000"
                step="50"
                className="sidebar-input"
                placeholder="e.g. 500"
                value={distanceFilter}
                onChange={(event) => handleDistanceChange(event.target.value)}
              />
            </div>
            <input
              type="range"
              className="sidebar-range"
              min="0"
              max="4000"
              step="100"
              value={sliderDistanceValue}
              onChange={(event) => handleDistanceChange(event.target.value)}
              aria-label="Maximum distance in meters"
            />
            <div className="sidebar-range-values">
              <span>0 m</span>
              <span>4000 m</span>
            </div>
          </div>
        </SidebarSection>
        <SidebarSection
          title="สิ่งอำนวยความสะดวก"
          open={openSections.amenities}
          onToggle={() => handleSectionToggle("amenities")}
        >
          <div className="amenity-filter-grid">
            {AMENITY_FILTER_OPTIONS.map((option) => {
              const isActiveAmenity = amenityFilter?.has?.(option.key);
              return (
                <button
                  key={option.key}
                  type="button"
                  className={`amenity-filter-button${isActiveAmenity ? " active" : ""}`}
                  onClick={() => onToggleAmenity?.(option.key)}
                  aria-pressed={Boolean(isActiveAmenity)}
                >
                  <span className="amenity-filter-icon" aria-hidden="true">
                    {option.icon}
                  </span>
                  <span className="amenity-filter-label">{option.label}</span>
                </button>
              );
            })}
          </div>
        </SidebarSection>
      </nav>
      <div className="sidebar-footer">
        <button
          type="button"
          className="sidebar-reset-button"
          onClick={onResetFilters}
          disabled={!filtersActive}
        >
          ค่าเริ่มต้น
        </button>
      </div>
    </aside>
  );
}
export default function MapPage() {
  const [dorms, setDorms] = useState([]);
  const [pois, setPois] = useState([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const locked = true;
  const [q, setQ] = useState("");
  const [, setBounds] = useState(null);
  const [selectedDorm, setSelectedDorm] = useState(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedPoi, setSelectedPoi] = useState(null);
  const [poiDetailsOpen, setPoiDetailsOpen] = useState(false);
  const [activeFilters, setActiveFilters] = useState(() => new Set());
  const closePoiDetails = useCallback(() => {
    setPoiDetailsOpen(false);
    setSelectedPoi(null);
  }, []);
  const mapRef = useRef(null);
  const openPopupRef = useRef(null);
  const routeRequestRef = useRef(0);
  const [routeState, setRouteState] = useState(() => ({ ...EMPTY_ROUTE_STATE }));
  const routeDormId = routeState.active ? routeState.dormId : null;
  const [compareTargetId, setCompareTargetId] = useState(null);
  const [compareMode, setCompareMode] = useState(false);
  const [compareBaseDorm, setCompareBaseDorm] = useState(null);
  const [comparePendingId, setComparePendingId] = useState(null);
  const [topSearchFocused, setTopSearchFocused] = useState(false);
  const [sidebarSearchFocused, setSidebarSearchFocused] = useState(false);
  const [priceFilter, setPriceFilter] = useState({ min: "", max: "" });
  const [distanceFilter, setDistanceFilter] = useState("");
  const [amenityFilter, setAmenityFilter] = useState(() => new Set());
  const [filterResetToken, setFilterResetToken] = useState(0);
  const applyOffsetAfterMove = useCallback(
    (animate = false) => {
      const map = mapRef.current;
      if (!map || !MAP_VIEW_OFFSET) return;
      const run = () => {
        map.panBy(MAP_VIEW_OFFSET, { animate: false });
      };
      if (animate) {
        map.once("moveend", run);
      } else {
        run();
      }
    },
    [],
  );
  const toggleFilter = useCallback((key) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);
  const handlePriceFilterChange = useCallback((field, value) => {
    setPriceFilter((prev) => ({
      ...prev,
      [field]: value,
    }));
  }, []);
  const handleDistanceFilterChange = useCallback((value) => {
    setDistanceFilter(value);
  }, []);
  const handleAmenityToggle = useCallback((key) => {
    setAmenityFilter((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);
  const handleResetFilters = useCallback(() => {
    setActiveFilters(new Set());
    setPriceFilter({ min: "", max: "" });
    setDistanceFilter("");
    setAmenityFilter(new Set());
    setFilterResetToken((token) => token + 1);
  }, []);
  const selectedAmenities = useMemo(
    () => Array.from(amenityFilter),
    [amenityFilter],
  );
  const parsedPriceFilter = useMemo(() => {
    const parse = (value) => {
      if (value === "" || value == null) return null;
      const num = Number(value);
      if (!Number.isFinite(num) || num < 0) return null;
      return num;
    };
    const min = parse(priceFilter?.min);
    const max = parse(priceFilter?.max);
    return { min, max };
  }, [priceFilter]);
  const priceFilterActive =
    parsedPriceFilter.min != null || parsedPriceFilter.max != null;
  const priceMinBound =
    parsedPriceFilter.min != null
      ? Math.max(0, parsedPriceFilter.min - PRICE_WIGGLE)
      : null;
  const priceMaxBound =
    parsedPriceFilter.max != null ? parsedPriceFilter.max + PRICE_WIGGLE : null;
  const distanceFilterMeters = useMemo(() => {
    if (distanceFilter === "" || distanceFilter == null) return null;
    const num = Number(distanceFilter);
    if (!Number.isFinite(num) || num < 0) return null;
    return Math.min(num, 4000);
  }, [distanceFilter]);
  const distanceFilterActive = distanceFilterMeters != null;
  const distanceThresholdMeters = distanceFilterMeters;
  const amenitiesFilterActive = selectedAmenities.length > 0;
  const dormFiltersActive =
    priceFilterActive || distanceFilterActive || amenitiesFilterActive;
  const placeFiltersActive = activeFilters.size > 0;
  const filtersActive = dormFiltersActive || placeFiltersActive;
  const selectedPoiKeys = useMemo(
    () => POI_FILTER_KEYS.filter((key) => activeFilters.has(key)),
    [activeFilters],
  );
  const baseShowDorms = dormFiltersActive
    ? true
    : !placeFiltersActive || activeFilters.has("dorm");
  const baseShowPois = dormFiltersActive
    ? false
    : !placeFiltersActive
      ? true
      : selectedPoiKeys.length > 0;
  const showDorms = compareMode ? true : baseShowDorms;
  const showPois = compareMode ? false : baseShowPois;
  const filteredDorms = useMemo(() => {
    if (!Array.isArray(dorms)) return [];
    if (!dormFiltersActive) return dorms;
    return dorms.filter((dorm) => {
      if (priceFilterActive) {
        const range = extractPriceRange(dorm);
        if (!range) return false;
        const dormMin = range.min != null ? range.min : range.max;
        const dormMax = range.max != null ? range.max : range.min;
        const effectiveMin = dormMin != null ? dormMin : dormMax;
        const effectiveMax = dormMax != null ? dormMax : dormMin;
        if (
          priceMinBound != null &&
          (effectiveMax == null || effectiveMax < priceMinBound)
        ) {
          return false;
        }
        if (
          priceMaxBound != null &&
          (effectiveMin == null || effectiveMin > priceMaxBound)
        ) {
          return false;
        }
      }
      if (distanceFilterActive) {
        const meters = computeDormDistanceMeters(dorm);
        if (meters == null) return false;
        if (distanceThresholdMeters == null) return false;
        if (Math.abs(meters - distanceThresholdMeters) >= DISTANCE_WIGGLE_METERS) {
          return false;
        }
      }
      if (amenitiesFilterActive) {
        const tokens = normalizeAmenityList(dorm?.amenities);
        if (tokens.length === 0) return false;
        const matchesAll = selectedAmenities.every((key) =>
          tokens.some((token) => token.includes(key)),
        );
        if (!matchesAll) return false;
      }
      return true;
    });
  }, [
    dorms,
    dormFiltersActive,
    priceFilterActive,
    priceMinBound,
    priceMaxBound,
    distanceFilterActive,
    distanceThresholdMeters,
    amenitiesFilterActive,
    selectedAmenities,
  ]);

  const [searchRecommendations, setSearchRecommendations] = useState([]);
  const refreshRecommendations = useCallback(() => {
    if (!Array.isArray(filteredDorms) || filteredDorms.length === 0) {
      setSearchRecommendations((prev) => (prev.length > 0 ? [] : prev));
      return;
    }
    const viableDorms = filteredDorms.filter((item) => {
      const name = typeof item?.name === "string" ? item.name.trim() : "";
      return name.length > 0;
    });
    if (viableDorms.length === 0) {
      setSearchRecommendations((prev) => (prev.length > 0 ? [] : prev));
      return;
    }
    if (viableDorms.length <= 4) {
      setSearchRecommendations(viableDorms);
      return;
    }
    const pool = [...viableDorms];
    for (let i = pool.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    setSearchRecommendations(pool.slice(0, 4));
  }, [filteredDorms]);

  useEffect(() => {
    const focused = topSearchFocused || sidebarSearchFocused;
    const hasQuery = q.trim().length > 0;
    if (focused && !hasQuery) {
      refreshRecommendations();
    } else {
      setSearchRecommendations((prev) => (prev.length > 0 ? [] : prev));
    }
  }, [q, topSearchFocused, sidebarSearchFocused, refreshRecommendations]);

  const visiblePois = useMemo(() => {
    if (routeDormId) return [];
    if (!showPois) return [];
    if (!placeFiltersActive || compareMode) return showPois ? pois : [];
    const allowed = new Set(selectedPoiKeys);
    return pois.filter((p) => allowed.has(p.category));
  }, [pois, showPois, placeFiltersActive, selectedPoiKeys, compareMode, routeDormId]);
  const handlePopupOpen = useCallback((data) => {
    openPopupRef.current = data;
  }, []);
  const handlePopupClose = useCallback(() => {
    openPopupRef.current = null;
  }, []);
  const compareTargetDorm = useMemo(
    () => filteredDorms.find((item) => item._id === compareTargetId) || null,
    [filteredDorms, compareTargetId],
  );
  const comparisonSummary = useMemo(() => {
    if (!selectedDorm || !compareTargetDorm) return null;
    const baseRange = extractPriceRange(selectedDorm);
    const targetRange = extractPriceRange(compareTargetDorm);
    if (!baseRange || !targetRange) {
      return {
        baseDormId: selectedDorm._id,
        targetDorm: compareTargetDorm,
        baseRange,
        targetRange,
        sameCurrency: false,
        incomplete: true,
        diffMode: null,
        diffSmall: null,
        diffBig: null,
      };
    }
    const sameCurrency = baseRange.currency === targetRange.currency;
    if (!sameCurrency) {
      return {
        baseDormId: selectedDorm._id,
        targetDorm: compareTargetDorm,
        baseRange,
        targetRange,
        sameCurrency: false,
        incomplete: false,
        diffMode: null,
        diffSmall: null,
        diffBig: null,
      };
    }
    const baseProfile = buildPriceProfile(baseRange);
    const targetProfile = buildPriceProfile(targetRange);
    if (baseProfile.type === "none" || targetProfile.type === "none") {
      return {
        baseDormId: selectedDorm._id,
        targetDorm: compareTargetDorm,
        baseRange,
        targetRange,
        sameCurrency: true,
        incomplete: true,
        diffMode: null,
        diffSmall: null,
        diffBig: null,
      };
    }
    const diffSmall =
      targetProfile.small != null && baseProfile.small != null
        ? targetProfile.small - baseProfile.small
        : null;
    const diffBig =
      targetProfile.big != null && baseProfile.big != null
        ? targetProfile.big - baseProfile.big
        : null;
    const diffMode =
      baseProfile.type === "dual" || targetProfile.type === "dual"
        ? "dual"
        : "single";
    let incomplete = false;
    let finalDiffSmall = diffSmall;
    let finalDiffBig = diffMode === "dual" ? diffBig : null;
    if (diffMode === "single") {
      if (finalDiffSmall == null) {
        incomplete = true;
        finalDiffSmall = null;
      }
    } else {
      if (finalDiffSmall == null || finalDiffBig == null) {
        incomplete = true;
        if (finalDiffSmall == null) finalDiffSmall = null;
        if (finalDiffBig == null) finalDiffBig = null;
      }
    }
    return {
      baseDormId: selectedDorm._id,
      targetDorm: compareTargetDorm,
      baseRange,
      targetRange,
      sameCurrency,
      incomplete,
      diffMode,
      diffSmall: finalDiffSmall,
      diffBig: finalDiffBig,
    };
  }, [selectedDorm, compareTargetDorm]);
  const routeDormData = useMemo(() => {
    if (!routeDormId) return null;
    const byFiltered = filteredDorms.find(
      (item) => getDormRouteIdentifier(item) === routeDormId,
    );
    if (byFiltered) return byFiltered;
    if (
      selectedDorm &&
      getDormRouteIdentifier(selectedDorm) === routeDormId
    ) {
      return selectedDorm;
    }
    const byAll = dorms.find(
      (item) => getDormRouteIdentifier(item) === routeDormId,
    );
    return byAll || null;
  }, [routeDormId, filteredDorms, selectedDorm, dorms]);
  const dormMarkers = useMemo(() => {
    if (!showDorms) return [];
    if (routeDormId) {
      return routeDormData ? [routeDormData] : [];
    }
    return filteredDorms;
  }, [showDorms, filteredDorms, routeDormId, routeDormData]);
  const compareOptions = useMemo(() => {
    if (!Array.isArray(filteredDorms)) return [];
    const baseId = compareBaseDorm?._id;
    return filteredDorms.filter((item) => item?._id && item._id !== baseId);
  }, [filteredDorms, compareBaseDorm]);
  const searchSuggestions = useMemo(() => {
    const dormList = Array.isArray(filteredDorms) ? filteredDorms : [];
    if (dormList.length === 0) return [];
    const term = q.trim().toLowerCase();
    if (!term) {
      return searchRecommendations.slice(0, 4);
    }
    const seen = new Set();
    const prefixMatches = [];
    dormList.forEach((item) => {
      const name = typeof item?.name === "string" ? item.name.trim() : "";
      if (!name) return;
      const lowerName = name.toLowerCase();
      const key = item?._id || lowerName;
      if (seen.has(key)) return;
      if (lowerName.startsWith(term)) {
        seen.add(key);
        prefixMatches.push(item);
      }
    });
    return prefixMatches.slice(0, 8);
  }, [filteredDorms, q, searchRecommendations]);
  const topSuggestionsVisible =
    !sidebarOpen && topSearchFocused && searchSuggestions.length > 0;
  const sidebarSuggestionsVisible =
    sidebarOpen && sidebarSearchFocused && searchSuggestions.length > 0;
  const handleTopSearchFocusChange = useCallback(
    (isFocused) => {
      setTopSearchFocused(isFocused);
    },
    [],
  );
  const handleSidebarSearchFocusChange = useCallback(
    (isFocused) => {
      setSidebarSearchFocused(isFocused);
    },
    [],
  );
  const enterCompareMode = useCallback(
    (baseDorm) => {
      if (!baseDorm?._id) return;
      closePoiDetails();
      setCompareBaseDorm(baseDorm);
      setCompareMode(true);
      setComparePendingId(null);
      setCompareTargetId(null);
      setSelectedDorm(baseDorm);
      setDetailsOpen(false);
      mapRef.current?.closePopup();
      openPopupRef.current = null;
    },
    [closePoiDetails],
  );
  const cancelCompareMode = useCallback(() => {
    closePoiDetails();
    setCompareMode(false);
    setComparePendingId(null);
    setCompareTargetId(null);
    if (compareBaseDorm?._id) {
      setSelectedDorm(compareBaseDorm);
      setDetailsOpen(true);
    }
    setCompareBaseDorm(null);
    mapRef.current?.closePopup();
    openPopupRef.current = null;
  }, [compareBaseDorm, closePoiDetails]);
  const finalizeComparison = useCallback(
    (targetDormId) => {
      if (
        !compareBaseDorm?._id ||
        !targetDormId ||
        targetDormId === compareBaseDorm._id
      )
        return;
      const base = compareBaseDorm;
      if (!filteredDorms.some((item) => item._id === targetDormId)) return;
      closePoiDetails();
      setCompareTargetId(targetDormId);
      setCompareMode(false);
      setComparePendingId(null);
      if (base) {
        setSelectedDorm(base);
        setDetailsOpen(true);
      }
      setCompareBaseDorm(null);
      mapRef.current?.closePopup();
      openPopupRef.current = null;
    },
    [compareBaseDorm, filteredDorms, closePoiDetails],
  );
  const handleDormDetailsClick = useCallback(
    (dorm) => {
      closePoiDetails();
      setCompareMode(false);
      setCompareBaseDorm(null);
      setComparePendingId(null);
      setCompareTargetId(null);
      setSelectedDorm(dorm);
      setDetailsOpen(true);
    },
    [closePoiDetails],
  );
  const handleClearRoute = useCallback(() => {
    routeRequestRef.current += 1;
    setRouteState(() => ({ ...EMPTY_ROUTE_STATE }));
    applyOffsetAfterMove(false);
  }, [applyOffsetAfterMove]);
  const handlePoiDetailsClick = useCallback(
    (poi) => {
      if (!poi || poi.category !== "bike") return;
      if (getPoiImageUrls(poi).length === 0) return;
      setCompareMode(false);
      setCompareBaseDorm(null);
      setComparePendingId(null);
      setCompareTargetId(null);
      setSelectedDorm(null);
      setDetailsOpen(false);
      setSelectedPoi(poi);
      setPoiDetailsOpen(true);
      handleClearRoute();
      mapRef.current?.closePopup();
      openPopupRef.current = null;
    },
    [handleClearRoute],
  );
  const handleShowRoute = useCallback(
    async (dorm) => {
      if (!dorm) {
        handleClearRoute();
        return;
      }
      const dormId = getDormRouteIdentifier(dorm);
      const coords = dorm?.location?.coordinates;
      if (!dormId || !Array.isArray(coords) || coords.length < 2) {
        handleClearRoute();
        return;
      }
      if (routeState.active && routeState.dormId === dormId) {
        handleClearRoute();
        return;
      }
      const requestId = routeRequestRef.current + 1;
      routeRequestRef.current = requestId;
      const startLat = Number(coords[1]);
      const startLng = Number(coords[0]);
      if (!Number.isFinite(startLat) || !Number.isFinite(startLng)) {
        handleClearRoute();
        return;
      }
      const destLat = BACK_GATE_COORDINATES[0];
      const destLng = BACK_GATE_COORDINATES[1];
      setRouteState({
        active: true,
        dormId,
        points: [],
        distance: null,
        duration: null,
        loading: true,
        error: null,
      });
      const radiusParam = `${ROUTE_SNAP_RADIUS_METERS};${ROUTE_SNAP_RADIUS_METERS}`;
      const coordsParam = `${startLng},${startLat};${destLng},${destLat}`;
      const url = `https://router.project-osrm.org/route/v1/foot/${coordsParam}?overview=full&geometries=geojson&steps=false&radiuses=${radiusParam}`;
      try {
        const res = await fetch(url);
        if (!res.ok) {
          throw new Error(`ไม่สามารถคำนวณเส้นทางได้ (รหัส ${res.status})`);
        }
        const data = await res.json();
        if (routeRequestRef.current !== requestId) return;
        const route = data?.routes?.[0];
        const rawPoints = route?.geometry?.coordinates;
        if (!Array.isArray(rawPoints) || rawPoints.length === 0) {
          throw new Error("ไม่พบเส้นทางเดินที่เหมาะสม");
        }
        const coordinates = rawPoints.map(([lng, lat]) => [lat, lng]);
        setRouteState({
          active: true,
          dormId,
          points: coordinates,
          distance: Number.isFinite(route?.distance) ? route.distance : null,
          duration: Number.isFinite(route?.duration) ? route.duration : null,
          loading: false,
          error: null,
        });
        if (mapRef.current && coordinates.length > 0) {
          const bounds = L.latLngBounds(coordinates);
          mapRef.current.fitBounds(bounds, {
            padding: [60, 60],
            maxZoom: 18,
          });
          applyOffsetAfterMove(true);
        }
      } catch (error) {
        if (routeRequestRef.current !== requestId) return;
        const fallback = "ไม่สามารถคำนวณเส้นทางได้ในขณะนี้";
        let message = fallback;
        if (error instanceof Error && error.message) {
          message = error.message.includes("Failed to fetch")
            ? fallback
            : error.message;
        }
        setRouteState({
          active: true,
          dormId,
          points: [],
          distance: null,
          duration: null,
          loading: false,
          error: message,
        });
      }
    },
    [handleClearRoute, mapRef, routeState.active, routeState.dormId, applyOffsetAfterMove],
  );
  const handleDetailsClose = useCallback(() => {
    setDetailsOpen(false);
    handleClearRoute();
  }, [handleClearRoute]);
  useEffect(() => {
    if (
      compareTargetId &&
      !filteredDorms.some((item) => item._id === compareTargetId)
    ) {
      setCompareTargetId(null);
    }
  }, [compareTargetId, filteredDorms]);
  useEffect(() => {
    if (
      compareMode &&
      compareBaseDorm?._id &&
      !filteredDorms.some((item) => item._id === compareBaseDorm._id)
    ) {
      cancelCompareMode();
    }
  }, [compareMode, compareBaseDorm, filteredDorms, cancelCompareMode]);

  useEffect(() => {
    if (!compareMode) {
      setComparePendingId(null);
    } else if (
      comparePendingId &&
      !compareOptions.some((item) => item._id === comparePendingId)
    ) {
      setComparePendingId(null);
    }
  }, [compareMode, comparePendingId, compareOptions]);
  useEffect(() => {
    const currentDormId = selectedDorm
      ? getDormRouteIdentifier(selectedDorm)
      : null;
    if (!currentDormId) {
      if (routeState.active) handleClearRoute();
      return;
    }
    if (
      routeState.active &&
      routeState.dormId &&
      routeState.dormId !== currentDormId
    ) {
      handleClearRoute();
    }
  }, [selectedDorm, routeState.active, routeState.dormId, handleClearRoute]);
  const center = useMemo(() => [13.823969, 100.516371], []);
  const targetBounds = useMemo(
    () => L.latLngBounds([13.82, 100.512], [13.8298, 100.5225]),
    [],
  );
  const routeStartPoint =
    routeState.active &&
    Array.isArray(routeState.points) &&
    routeState.points.length > 0
      ? routeState.points[0]
      : null;
  const routeEndPoint =
    routeState.active &&
    Array.isArray(routeState.points) &&
    routeState.points.length > 0
      ? routeState.points[routeState.points.length - 1]
      : null;
  const shouldShowRouteEnd =
    routeEndPoint &&
    (!routeStartPoint ||
      routeEndPoint[0] !== routeStartPoint[0] ||
      routeEndPoint[1] !== routeStartPoint[1]);
  // GeoJSON [lng, lat] -> Leaflet [lat, lng]
  const toLatLng = (coords) => {
    if (!coords || coords.length < 2) return null;
    let lng = Number(coords[0]);
    let lat = Number(coords[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (Math.abs(lat) > 90 && Math.abs(lng) <= 90) [lng, lat] = [lat, lng];
    return [lat, lng];
  };
  const handleSuggestionSelect = (dorm) => {
    if (!dorm) return;
    const dormName = typeof dorm?.name === "string" ? dorm.name : "";
    if (dormName) {
      setQ(dormName);
    }
    const latlng = toLatLng(dorm?.location?.coordinates);
    const map = mapRef.current;
    if (latlng && map) {
      const currentZoom =
        typeof map.getZoom === "function" ? map.getZoom() : 16;
      const targetZoom =
        Number.isFinite(currentZoom) && currentZoom < 17 ? 17 : currentZoom;
      if (typeof map.flyTo === "function") {
        map.flyTo(latlng, targetZoom, { duration: 0.8 });
        applyOffsetAfterMove(true);
      } else if (typeof map.setView === "function") {
        map.setView(latlng, targetZoom, { animate: true });
        applyOffsetAfterMove(true);
      }
    }
    handleDormDetailsClick(dorm);
    handleTopSearchFocusChange(false);
    handleSidebarSearchFocusChange(false);
  };

  const handleSearchSubmit = () => {
    const term = q.trim().toLowerCase();
    if (!term) return;
    const dormList = Array.isArray(filteredDorms) ? filteredDorms : [];
    if (dormList.length === 0) return;
    let target = null;
    if (searchSuggestions.length > 0) {
      target = searchSuggestions[0];
    }
    if (!target) {
      target = dormList.find((item) => {
        const name = typeof item?.name === "string" ? item.name.trim() : "";
        return name && name.toLowerCase().startsWith(term);
      });
    }
    if (!target) {
      target = dormList.find((item) => {
        const name = typeof item?.name === "string" ? item.name.trim() : "";
        return name && name.toLowerCase().includes(term);
      });
    }
    if (target) {
      handleSuggestionSelect(target);
    }
  };

  useEffect(() => {
    if (!selectedDorm) return;
    if (!filteredDorms.some((item) => item?._id === selectedDorm._id)) {
      setSelectedDorm(null);
      setDetailsOpen(false);
    }
  }, [filteredDorms, selectedDorm]);
  useEffect(() => {
    if (!showDorms) {
      if (selectedDorm) setSelectedDorm(null);
      if (detailsOpen) setDetailsOpen(false);
    }
  }, [showDorms, selectedDorm, detailsOpen]);
  useEffect(() => {
    if (!showPois) {
      closePoiDetails();
    }
  }, [showPois, closePoiDetails]);
  useEffect(() => {
    if (!selectedPoi) return;
    if (!Array.isArray(visiblePois)) {
      closePoiDetails();
      return;
    }
    if (!visiblePois.some((item) => item?._id === selectedPoi._id)) {
      closePoiDetails();
    }
  }, [selectedPoi, visiblePois, closePoiDetails]);
  useEffect(() => {
    const current = openPopupRef.current;
    if (!current || current.type !== "dorm") return;
    if (!filteredDorms.some((item) => item?._id === current.id)) {
      mapRef.current?.closePopup();
      openPopupRef.current = null;
    }
  }, [filteredDorms]);
  useEffect(() => {
    const current = openPopupRef.current;
    if (!current) return;
    if (
      (!showDorms && current.type === "dorm") ||
      (!showPois && current.type === "poi")
    ) {
      mapRef.current?.closePopup();
      openPopupRef.current = null;
    }
  }, [showDorms, showPois]);
  // Fetch dorms + POIs whenever q/bounds change
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const baseParams = { q };
        const dormPromise = showDorms
          ? fetchDorms(baseParams)
          : Promise.resolve([]);
        const poiFetchCategories =
          placeFiltersActive && showPois && selectedPoiKeys.length
            ? selectedPoiKeys
            : null;
        const poiPromise = showPois
          ? fetchPois(
              poiFetchCategories && poiFetchCategories.length
                ? { ...baseParams, category: poiFetchCategories.join(",") }
                : baseParams,
            )
          : Promise.resolve([]);
        const [dormData, poiData] = await Promise.all([
          dormPromise,
          poiPromise,
        ]);
        if (!cancelled) {
          setDorms(dormData);
          setPois(poiData);
        }
      } catch (e) {
        if (!cancelled) console.error(e);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q, showDorms, showPois, placeFiltersActive, selectedPoiKeys]);
  return (
    <div style={{ height: "100vh", width: "100vw" }}>
      <MapContainer
        center={center}
        zoom={16}
        maxZoom={MAP_MAX_ZOOM}
        zoomControl={false}
        maxBoundsViscosity={1.0}
        style={{ height: "100%", width: "100%" }}
        whenCreated={(mapInstance) => {
          mapRef.current = mapInstance;
          if (mapInstance && typeof mapInstance.whenReady === "function") {
            mapInstance.whenReady(() => {
              applyOffsetAfterMove(false);
            });
          } else {
            applyOffsetAfterMove(false);
          }
        }}
      >
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={MAP_MAX_ZOOM}
        />
        <BoundsWatcher onBounds={setBounds} />
        <LockToBounds bounds={targetBounds} locked={locked} offset={MAP_VIEW_OFFSET} />
        <MapMoveWatcher openPopupRef={openPopupRef} />
        <ZoomControl position="bottomright" />
        {routeState.active && routeState.points.length > 1 ? (
          <>
            <Polyline
              positions={routeState.points}
              pathOptions={{
                color: "#dc2626",
                weight: 4,
                opacity: 0.8,
                dashArray: "8 12",
                lineCap: "round",
                lineJoin: "round",
              }}
            />
            {routeStartPoint ? (
              <CircleMarker
                key="route-start"
                center={routeStartPoint}
                radius={5.5}
                pathOptions={{
                  color: "#b91c1c",
                  weight: 2,
                  fillOpacity: 0.95,
                  fillColor: "#fca5a5",
                }}
              />
            ) : null}
            {shouldShowRouteEnd ? (
              <CircleMarker
                key="route-end"
                center={routeEndPoint}
                radius={5.5}
                pathOptions={{
                  color: "#7f1d1d",
                  weight: 2,
                  fillOpacity: 0.95,
                  fillColor: "#dc2626",
                }}
              />
            ) : null}
          </>
        ) : null}
        {dormMarkers.map((d) => {
          const popupPriceRange = extractPriceRange(d);
          const popupPriceText = popupPriceRange
            ? formatRangeText(popupPriceRange, { includePeriod: false })
            : null;
          return (
            <Marker
              key={d._id}
              position={toLatLng(d?.location?.coordinates)}
              eventHandlers={{
                popupopen: (event) =>
                  handlePopupOpen({
                    type: "dorm",
                    id: d._id,
                    latlng: event.target.getLatLng(),
                  }),
                popupclose: handlePopupClose,
              }}
            >
              <Popup autoPan={false}>
                <div>
                  <b>{d.name}</b>
                  <br />
                  {d.type}
                  {popupPriceText ? (
                    <>
                      <br />
                      {popupPriceText}
                    </>
                  ) : null}
                  <br />
                  {compareMode && compareBaseDorm?._id ? (
                    <button
                      className="popup-more-btn compare"
                      onClick={() => finalizeComparison(d._id)}
                      disabled={compareBaseDorm._id === d._id}
                    >
                      {compareBaseDorm._id === d._id ? "Selected" : "Compare"}
                    </button>
                  ) : (
                    <button
                      className="popup-more-btn"
                      onClick={() => {
                        handleDormDetailsClick(d);
                      }}
                    >
                      รายละเอียดเพิ่มเติม
                    </button>
                  )}
                </div>
              </Popup>
            </Marker>
          );
        })}
        {visiblePois.map((p) => {
          const markerIcon = poiImgIcons[p.category] ?? poiImgIcons.food;
          const categoryLabel = CATEGORY_LABELS[p.category] ?? p.category;
          const isBike = p.category === "bike";
          const bikeHasPhotos = isBike ? getPoiImageUrls(p).length > 0 : false;
          return (
            <Marker
              key={p._id}
              position={toLatLng(p?.location?.coordinates)}
              icon={markerIcon}
              eventHandlers={{
                popupopen: (event) =>
                  handlePopupOpen({
                    type: "poi",
                    id: p._id,
                    latlng: event.target.getLatLng(),
                  }),
                popupclose: handlePopupClose,
              }}
            >
              <Popup autoPan={false}>
                <div>
                  <b>{p.name}</b>
                  <br />
                  {categoryLabel}
                  {p.description ? (
                    <>
                      <br />
                      {p.description}
                    </>
                  ) : null}
                  {isBike && bikeHasPhotos ? (
                    <>
                      <br />
                      <button
                        className="popup-more-btn"
                        onClick={() => handlePoiDetailsClick(p)}
                      >
                        View photo
                      </button>
                    </>
                  ) : null}
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
      {/* Top-left search/trigger when sidebar closed */}
      {!sidebarOpen && (
        <div
          className={`map-search-container${topSuggestionsVisible ? " open" : ""}`}
          role="search"
        >
          <div className="map-search-bar">
            <button
              type="button"
              className="map-search-toggle"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open sidebar"
            >
              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
                focusable="false"
                className="map-search-svg"
              >
                <path
                  d="M4 6h16M4 12h16M4 18h16"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <input
              className="map-search-input"
              type="text"
              placeholder={
                "\u0E04\u0E49\u0E19\u0E2B\u0E32\u0E0A\u0E37\u0E48\u0E2D\u0E2B\u0E2D\u0E1E\u0E31\u0E01"
              }
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onFocus={() => handleTopSearchFocusChange(true)}
              onBlur={() => handleTopSearchFocusChange(false)}
            />
            {q ? (
              <button
                type="button"
                className="map-search-clear"
                onClick={() => setQ("")}
                aria-label="Clear search"
              >
                <svg
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  focusable="false"
                  className="map-search-svg"
                >
                  <path
                    d="M6 6l12 12M18 6l-12 12"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            ) : null}
            <button
              type="button"
              className="map-search-icon"
              onClick={handleSearchSubmit}
              aria-label="??????????"
            >
              <svg
                viewBox="0 0 24 24"
                focusable="false"
                className="map-search-svg"
              >
                <circle
                  cx="11"
                  cy="11"
                  r="6"
                  stroke="currentColor"
                  strokeWidth="2"
                  fill="none"
                />
                <path
                  d="m20 20-3.5-3.5"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
          <SearchSuggestionList
            items={searchSuggestions}
            visible={topSuggestionsVisible}
            onSelect={handleSuggestionSelect}
            variant="map"
          />
        </div>
      )}
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        q={q}
        onQueryChange={setQ}
        activeCategories={activeFilters}
        onToggleCategory={toggleFilter}
        suggestions={searchSuggestions}
        suggestionsVisible={sidebarSuggestionsVisible}
        onSuggestionSelect={handleSuggestionSelect}
        onSearchFocusChange={handleSidebarSearchFocusChange}
        priceFilter={priceFilter}
        onPriceFilterChange={handlePriceFilterChange}
        distanceFilter={distanceFilter}
        onDistanceFilterChange={handleDistanceFilterChange}
        amenityFilter={amenityFilter}
        onToggleAmenity={handleAmenityToggle}
        onResetFilters={handleResetFilters}
        filtersActive={filtersActive}
        resetSignal={filterResetToken}
      />
      {/* Branding/count */}
      <div
        style={{
          position: "fixed",
          bottom: 10,
          left: 40,
          padding: "4px 8px",
          borderRadius: 4,
          fontWeight: "bold",
          fontFamily: "'Inknut Antiqua', serif",
          fontSize: "1.5rem",
          color: "#6C7E84",
          zIndex: 500,
        }}
      >
        Dorm-Finder
        {typeof filteredDorms?.length === "number"
          ? ` (${filteredDorms.length})`
          : ""}
      </div>
      {/* Right side details */}
      <DormDetailsPanel
        dorm={selectedDorm}
        open={detailsOpen && !!selectedDorm}
        onClose={handleDetailsClose}
        onStartCompare={enterCompareMode}
        comparison={comparisonSummary}
        onShowRoute={handleShowRoute}
        routeState={routeState}
      />
      <PoiDetailsPanel
        poi={selectedPoi}
        open={poiDetailsOpen && !!selectedPoi}
        onClose={closePoiDetails}
      />
      {compareMode && compareBaseDorm ? (
        <CompareOverlay
          baseDorm={compareBaseDorm}
          options={compareOptions}
          pendingId={comparePendingId}
          onPendingChange={setComparePendingId}
          onConfirm={() => {
            if (comparePendingId) {
              finalizeComparison(comparePendingId);
            }
          }}
          onCancel={cancelCompareMode}
        />
      ) : null}
    </div>
  );
}
function SearchSuggestionList({ items, visible, onSelect, variant = "map" }) {
  if (!visible || !Array.isArray(items) || items.length === 0) return null;
  const className =
    variant === "sidebar"
      ? "search-suggestions sidebar"
      : "search-suggestions map";
  return (
    <div className={className} role="listbox">
      {items.map((item, index) => {
        const key = item?._id || `${item?.name || "item"}-${index}`;
        const title = typeof item?.name === "string" ? item.name : "Dorm";
        const subtitleRaw =
          typeof item?.address === "string"
            ? item.address
            : typeof item?.address?.full === "string"
              ? item.address.full
              : typeof item?.address?.line1 === "string"
                ? item.address.line1
                : typeof item?.address?.street === "string"
                  ? item.address.street
                  : null;
        const subtitle =
          typeof subtitleRaw === "string" ? subtitleRaw.trim() : null;
        return (
          <button
            type="button"
            key={key}
            className="search-suggestion-item"
            role="option"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onSelect?.(item)}
          >
            <span className="search-suggestion-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" focusable="false">
                <path
                  d="M12 2C8.134 2 5 5.134 5 9c0 4.25 5.7 11.2 6 11.6a1 1 0 0 0 1.6 0C13.3 20.2 19 13.25 19 9c0-3.866-3.134-7-7-7Zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5Z"
                  fill="currentColor"
                />
              </svg>
            </span>
            <span className="search-suggestion-text">
              <span className="search-suggestion-title">{title}</span>
              {subtitle ? (
                <span className="search-suggestion-subtitle">{subtitle}</span>
              ) : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}
function DormDetailsPanel({
  dorm,
  open,
  onClose,
  onStartCompare,
  comparison,
  onShowRoute,
  routeState,
}) {
  const imageUrls = useMemo(() => getDormImageUrls(dorm), [dorm]);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const totalImages = imageUrls.length;
  const hasGallery = totalImages > 0;
  const [viewerNaturalSize, setViewerNaturalSize] = useState(null);
  const [viewerStageBounds, setViewerStageBounds] = useState(() =>
    computeViewerBounds(),
  );
  const updateViewerIndex = useCallback(
    (updater) => {
      setViewerNaturalSize(null);
      if (typeof updater === "function") {
        setViewerIndex((current) => updater(current));
      } else {
        setViewerIndex(updater);
      }
    },
    [setViewerNaturalSize, setViewerIndex],
  );
  useEffect(() => {
    const updateBounds = () => setViewerStageBounds(computeViewerBounds());
    updateBounds();
    window.addEventListener("resize", updateBounds);
    return () => window.removeEventListener("resize", updateBounds);
  }, []);
  useEffect(() => {
    if (viewerOpen) {
      setViewerStageBounds(computeViewerBounds());
    } else {
      setViewerNaturalSize(null);
    }
  }, [viewerOpen]);
  useEffect(() => {
    if (!open) {
      setViewerOpen(false);
      updateViewerIndex(() => 0);
    }
  }, [open, updateViewerIndex]);
  useEffect(() => {
    setViewerOpen(false);
    updateViewerIndex(() => 0);
  }, [dorm?._id, updateViewerIndex]);
  const heroImage = useMemo(
    () => (imageUrls.length > 0 ? imageUrls[0] : dormIcon),
    [imageUrls],
  );
  const headerStyle = useMemo(
    () => ({ backgroundImage: `url(${heroImage})` }),
    [heroImage],
  );
  const openViewerAt = useCallback(
    (index = 0) => {
      if (!hasGallery) return;
      const safeIndex = Math.min(Math.max(index, 0), totalImages - 1);
      updateViewerIndex(safeIndex);
      setViewerOpen(true);
    },
    [hasGallery, totalImages, updateViewerIndex],
  );
  const handleCloseViewer = useCallback(() => {
    setViewerOpen(false);
  }, []);
  const handlePrevImage = useCallback(() => {
    if (totalImages < 2) return;
    updateViewerIndex((current) => (current - 1 + totalImages) % totalImages);
  }, [totalImages, updateViewerIndex]);
  const handleNextImage = useCallback(() => {
    if (totalImages < 2) return;
    updateViewerIndex((current) => (current + 1) % totalImages);
  }, [totalImages, updateViewerIndex]);
  useEffect(() => {
    if (!viewerOpen) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        handleCloseViewer();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        handlePrevImage();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        handleNextImage();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [viewerOpen, handleCloseViewer, handlePrevImage, handleNextImage]);
  const stageStyle = useMemo(() => {
    const { width, height } = viewerStageBounds;
    return {
      width: `${width}px`,
      height: `${height}px`,
    };
  }, [viewerStageBounds]);
  const imageStyle = useMemo(() => {
    if (
      !viewerNaturalSize ||
      viewerNaturalSize.width <= 0 ||
      viewerNaturalSize.height <= 0
    ) {
      return { maxWidth: "100%", maxHeight: "100%" };
    }
    const { width: maxWidth, height: maxHeight } = viewerStageBounds;
    const scale = Math.min(
      maxWidth / viewerNaturalSize.width,
      maxHeight / viewerNaturalSize.height,
      1,
    );
    return {
      width: `${Math.max(1, Math.round(viewerNaturalSize.width * scale))}px`,
      height: `${Math.max(1, Math.round(viewerNaturalSize.height * scale))}px`,
    };
  }, [viewerNaturalSize, viewerStageBounds]);
  const handleImageLoad = useCallback((event) => {
    const { naturalWidth, naturalHeight } = event.target || {};
    if (naturalWidth > 0 && naturalHeight > 0) {
      setViewerNaturalSize({ width: naturalWidth, height: naturalHeight });
    } else {
      setViewerNaturalSize(null);
    }
  }, []);
  const handleImageError = useCallback(() => {
    setViewerNaturalSize(null);
  }, []);
  const priceText = useMemo(() => {
    const range = extractPriceRange(dorm);
    return range ? formatRangeText(range) : null;
  }, [dorm]);
  const dormRouteId = useMemo(() => getDormRouteIdentifier(dorm), [dorm]);
  const renderDirectionsButton = () => {
    if (!dormRouteId) return null;
    const isActive =
      routeState?.active &&
      routeState?.dormId === dormRouteId &&
      !routeState?.loading &&
      !routeState?.error;
    const isErrored =
      routeState?.active &&
      routeState?.dormId === dormRouteId &&
      !!routeState?.error;
    const isLoading =
      routeState?.loading && routeState?.dormId === dormRouteId;
    const errorText =
      isErrored && !isLoading ? routeState?.error : null;
    return (
      <div className="route-action">
        <button
          type="button"
          className={`btn primary${isActive ? " active" : ""}`}
          onClick={() => onShowRoute?.(dorm)}
          disabled={isLoading}
        >
          {isLoading
            ? "กำลังคำนวณ..."
            : isErrored
              ? "ลองอีกครั้ง"
              : isActive
                ? "กำลังแสดงเส้นทาง"
                : "เส้นทาง"}
        </button>
        {errorText ? <div className="route-error">{errorText}</div> : null}
      </div>
    );
  };
  const directionsControl = renderDirectionsButton();
  const isComparisonVisible =
    comparison &&
    dorm?._id &&
    comparison.baseDormId === dorm._id &&
    comparison.targetDorm;
  const diffCurrency =
    comparison?.baseRange?.currency || comparison?.targetRange?.currency || "";
  const distanceText = useMemo(() => {
    const meters = computeDormDistanceMeters(dorm);
    if (meters == null || !Number.isFinite(meters)) return null;
    if (meters >= 1000) {
      const km = meters / 1000;
      return `${km >= 10 ? km.toFixed(1) : km.toFixed(2)} กม.`;
    }
    return `${Math.round(meters)} เมตร`;
  }, [dorm]);
  const descriptionText = useMemo(() => {
    const asString = (value) => {
      if (typeof value === "string") return value;
      if (Array.isArray(value)) {
        return value
          .map((item) => (typeof item === "string" ? item.trim() : ""))
          .filter(Boolean)
          .join("\n");
      }
      if (value && typeof value === "object") {
        if (typeof value.text === "string") return value.text;
        if (typeof value.content === "string") return value.content;
      }
      return null;
    };
    const { description, details } = dorm ?? {};
    const sources = [asString(description), asString(details?.description)].filter(
      (value) => typeof value === "string",
    );
    const result = sources.find((value) => value.trim().length > 0);
    return result ? result.trim() : null;
  }, [dorm]);
  const amenityTokens = useMemo(
    () => normalizeAmenityList(dorm?.amenities),
    [dorm],
  );
  const amenityFeatures = useMemo(
    () =>
      FEATURE_PRESETS.map((feature) => ({
        ...feature,
        available: amenityTokens.some((token) => token.includes(feature.key)),
      })),
    [amenityTokens],
  );
  return (
    <>
      <aside
        className={`detail-panel ${open ? "open" : ""}`}
        aria-hidden={!open}
      >
        <div className="detail-header" style={headerStyle}>
          {hasGallery ? (
            <button
              type="button"
              className="detail-header-trigger"
              onClick={() => openViewerAt(0)}
              aria-label="View dorm photos"
            >
              <span className="sr-only">View dorm photos</span>
              <span className="detail-header-trigger-hint" aria-hidden="true">
                View photos
              </span>
            </button>
          ) : null}
          <button className="detail-close" onClick={onClose} aria-label="close">
            x
          </button>
        </div>
        <div className="detail-body">
          {dorm ? (
            <div className="detail-content">
              <div className="detail-overview">
                <div className="detail-title-row">
                  <h2 className="detail-name">{dorm?.name || "Dorm"}</h2>
                  {dorm?.type && <span className="detail-type">{dorm.type}</span>}
                </div>
                <div className="detail-overview-meta">
                  {priceText && (
                    <span className="detail-price">{priceText}</span>
                  )}
                  {distanceText && (
                    <span className="detail-distance">
                      <svg
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                        focusable="false"
                      >
                        <path
                          d="M12 2a7 7 0 0 0-7 7c0 4.2 5.21 11.06 6.21 12.29a1 1 0 0 0 1.58 0C13.79 20.06 19 13.2 19 9a7 7 0 0 0-7-7Zm0 10a3 3 0 1 1 3-3 3 3 0 0 1-3 3Z"
                          fill="currentColor"
                        />
                      </svg>
                      {distanceText}
                    </span>
                  )}
                </div>
              </div>
              <section className="detail-section">
                <div className="detail-section-title">คำอธิบาย</div>
                <div className="detail-info-grid">
                  <div className="detail-info-card">
                    <div className="detail-info-label">ราคา</div>
                    <div className="detail-info-value">
                      {priceText ?? "ไม่มีข้อมูล"}
                    </div>
                  </div>
                  <div className="detail-info-card">
                    <div className="detail-info-label">
                      ระยะทางถึงมหาวิทยาลัย
                    </div>
                    <div className="detail-info-value">
                      {distanceText ?? "ไม่มีข้อมูล"}
                    </div>
                  </div>
                </div>
              </section>
              <section className="detail-section">
                <div className="detail-section-title">เพิ่มเติม</div>
                <div
                  className={`detail-description${descriptionText ? "" : " muted"}`}
                >
                  {descriptionText ?? "ไม่มีข้อมูล"}
                </div>
              </section>
              <section className="detail-section">
                <div className="detail-section-title">สิ่งอำนวยความสะดวก</div>
                <div className="detail-amenities">
                  {amenityFeatures.map((feature) => (
                    <div
                      key={feature.key}
                      className={`amenity-pill ${feature.available ? "available" : "muted"}`}
                    >
                      <span className="amenity-icon" aria-hidden="true">
                        {feature.icon}
                      </span>
                      <span>{feature.label}</span>
                    </div>
                  ))}
                </div>
              </section>
              <section className="detail-section">
                <div className="detail-section-title">การดำเนินการ</div>
                <div className="detail-actions">
                  {directionsControl ? (
                    <div className="detail-action route-action-slot">
                      {directionsControl}
                    </div>
                  ) : null}
                  <div className="detail-action compare-action-slot">
                    <button
                      className="btn secondary"
                      onClick={() => onStartCompare?.(dorm)}
                      disabled={!dorm?._id}
                    >
                      เปรียบเทียบราคา
                    </button>
                  </div>
                  <div className="detail-action close-action">
                    <button className="btn ghost" onClick={onClose}>
                      ปิด
                    </button>
                  </div>
                </div>
              </section>
              {isComparisonVisible && (
                <section className="detail-section">
                  <div className="detail-section-title">ตัวเปรียบเทียบราคา</div>
                  <div className="compare-card">
                    <div className="compare-results">
                      <div className="compare-row">
                        <span>{dorm?.name || "Dorm"}</span>
                        <span>{formatRangeText(comparison.baseRange)}</span>
                      </div>
                      <div className="compare-row">
                        <span>{comparison.targetDorm?.name || "Dorm"}</span>
                        <span>{formatRangeText(comparison.targetRange)}</span>
                      </div>
                      {comparison.incomplete ? (
                        <div className="compare-note">
                          Price details are incomplete for one of the dorms.
                        </div>
                      ) : comparison.sameCurrency ? (
                        <div className="compare-diff">
                          {comparison.diffMode === "dual" ? (
                            <>
                              {comparison.diffSmall != null && (
                                <div>
                                  Small room difference:{" "}
                                  {formatDiffText(
                                    comparison.diffSmall,
                                    diffCurrency,
                                  )}
                                </div>
                              )}
                              {comparison.diffBig != null && (
                                <div>
                                  Big room difference:{" "}
                                  {formatDiffText(
                                    comparison.diffBig,
                                    diffCurrency,
                                  )}
                                </div>
                              )}
                            </>
                          ) : (
                            comparison.diffSmall != null && (
                              <div>
                                Price difference:{" "}
                                {formatDiffText(
                                  comparison.diffSmall,
                                  diffCurrency,
                                )}
                              </div>
                            )
                          )}
                        </div>
                      ) : (
                        <div className="compare-note">
                          Currencies differ; differences are not calculated.
                        </div>
                      )}
                    </div>
                  </div>
                </section>
              )}
            </div>
          ) : (
            <div className="detail-empty">
              เลือกหอพักเพื่อดูรายละเอียดเพิ่มเติม
            </div>
          )}
        </div>
      </aside>
      {viewerOpen && hasGallery ? (
        <div
          className="image-viewer-overlay"
          role="dialog"
          aria-modal="true"
          onClick={handleCloseViewer}
        >
          <div
            className="image-viewer-dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="image-viewer-close"
              onClick={handleCloseViewer}
              aria-label="Close gallery"
            >
              x
            </button>
            <div className="image-viewer-main">
              {totalImages > 1 ? (
                <button
                  type="button"
                  className="image-viewer-nav prev"
                  onClick={handlePrevImage}
                  aria-label="Previous photo"
                >
                  {`<`}
                </button>
              ) : null}
              <div className="image-viewer-stage" style={stageStyle}>
                <img
                  src={imageUrls[viewerIndex]}
                  alt={`${dorm?.name || "Dorm"} photo ${viewerIndex + 1} of ${totalImages}`}
                  style={imageStyle}
                  onLoad={handleImageLoad}
                  onError={handleImageError}
                />
                {totalImages > 1 ? (
                  <div className="image-viewer-counter">
                    {viewerIndex + 1} / {totalImages}
                  </div>
                ) : null}
              </div>
              {totalImages > 1 ? (
                <button
                  type="button"
                  className="image-viewer-nav next"
                  onClick={handleNextImage}
                  aria-label="Next photo"
                >
                  {`>`}
                </button>
              ) : null}
            </div>
            {totalImages > 1 ? (
              <div className="image-viewer-thumbs">
                {imageUrls.map((url, index) => (
                  <button
                    type="button"
                    key={`${url}-${index}`}
                    className={`image-viewer-thumb${viewerIndex === index ? " active" : ""}`}
                    onClick={() => openViewerAt(index)}
                    aria-label={`Show photo ${index + 1}`}
                  >
                    <img src={url} alt="" />
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
function PoiDetailsPanel({ poi, open, onClose }) {
  const imageUrls = useMemo(() => getPoiImageUrls(poi), [poi]);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const totalImages = imageUrls.length;
  const hasGallery = totalImages > 0;
  const [viewerNaturalSize, setViewerNaturalSize] = useState(null);
  const [viewerStageBounds, setViewerStageBounds] = useState(() =>
    computeViewerBounds(),
  );
  const updateViewerIndex = useCallback(
    (updater) => {
      setViewerNaturalSize(null);
      if (typeof updater === "function") {
        setViewerIndex((current) => updater(current));
      } else {
        setViewerIndex(updater);
      }
    },
    [setViewerNaturalSize, setViewerIndex],
  );
  useEffect(() => {
    const updateBounds = () => setViewerStageBounds(computeViewerBounds());
    updateBounds();
    window.addEventListener("resize", updateBounds);
    return () => window.removeEventListener("resize", updateBounds);
  }, []);
  useEffect(() => {
    if (viewerOpen) {
      setViewerStageBounds(computeViewerBounds());
    } else {
      setViewerNaturalSize(null);
    }
  }, [viewerOpen]);
  useEffect(() => {
    if (!open) {
      setViewerOpen(false);
      updateViewerIndex(() => 0);
    }
  }, [open, updateViewerIndex]);
  useEffect(() => {
    setViewerOpen(false);
    updateViewerIndex(() => 0);
  }, [poi?._id, updateViewerIndex]);
  const heroImage = useMemo(
    () => (imageUrls.length > 0 ? imageUrls[0] : motorbikeIcon),
    [imageUrls],
  );
  const headerStyle = useMemo(
    () => ({ backgroundImage: `url(${heroImage})` }),
    [heroImage],
  );
  const openViewerAt = useCallback(
    (index = 0) => {
      if (!hasGallery) return;
      const safeIndex = Math.min(Math.max(index, 0), totalImages - 1);
      updateViewerIndex(safeIndex);
      setViewerOpen(true);
    },
    [hasGallery, totalImages, updateViewerIndex],
  );
  const isBike = poi?.category === "bike";
  useEffect(() => {
    if (!open || !isBike) return;
    if (hasGallery) {
      openViewerAt(0);
    } else {
      onClose?.();
    }
  }, [open, isBike, hasGallery, openViewerAt, onClose]);
  const handleCloseViewer = useCallback(() => {
    setViewerOpen(false);
    if (isBike) {
      onClose?.();
    }
  }, [isBike, onClose]);
  const handlePrevImage = useCallback(() => {
    if (totalImages < 2) return;
    updateViewerIndex((current) => (current - 1 + totalImages) % totalImages);
  }, [totalImages, updateViewerIndex]);
  const handleNextImage = useCallback(() => {
    if (totalImages < 2) return;
    updateViewerIndex((current) => (current + 1) % totalImages);
  }, [totalImages, updateViewerIndex]);
  useEffect(() => {
    if (!viewerOpen) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        handleCloseViewer();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        handlePrevImage();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        handleNextImage();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [viewerOpen, handleCloseViewer, handlePrevImage, handleNextImage]);
  const stageStyle = useMemo(() => {
    const { width, height } = viewerStageBounds;
    return {
      width: `${width}px`,
      height: `${height}px`,
    };
  }, [viewerStageBounds]);
  const imageStyle = useMemo(() => {
    if (
      !viewerNaturalSize ||
      viewerNaturalSize.width <= 0 ||
      viewerNaturalSize.height <= 0
    ) {
      return { maxWidth: "100%", maxHeight: "100%" };
    }
    const { width: maxWidth, height: maxHeight } = viewerStageBounds;
    const scale = Math.min(
      maxWidth / viewerNaturalSize.width,
      maxHeight / viewerNaturalSize.height,
      1,
    );
    return {
      width: `${Math.max(1, Math.round(viewerNaturalSize.width * scale))}px`,
      height: `${Math.max(1, Math.round(viewerNaturalSize.height * scale))}px`,
    };
  }, [viewerNaturalSize, viewerStageBounds]);
  const handleImageLoad = useCallback((event) => {
    const { naturalWidth, naturalHeight } = event.target || {};
    if (naturalWidth > 0 && naturalHeight > 0) {
      setViewerNaturalSize({ width: naturalWidth, height: naturalHeight });
    } else {
      setViewerNaturalSize(null);
    }
  }, []);
  const handleImageError = useCallback(() => {
    setViewerNaturalSize(null);
  }, []);
  const categoryLabel = useMemo(() => {
    if (!poi?.category) return "วินมอเตอร์ไซค์";
    return CATEGORY_LABELS[poi.category] || poi.category;
  }, [poi]);
  const distanceText = useMemo(() => {
    const meters = computeDormDistanceMeters(poi);
    if (meters == null || !Number.isFinite(meters)) return null;
    if (meters >= 1000) {
      const km = meters / 1000;
      return `${km >= 10 ? km.toFixed(1) : km.toFixed(2)} กม.`;
    }
    return `${Math.round(meters)} เมตร`;
  }, [poi]);
  const descriptionText = useMemo(() => {
    const asString = (value) => {
      if (typeof value === "string") return value;
      if (Array.isArray(value)) {
        return value
          .map((item) => (typeof item === "string" ? item.trim() : ""))
          .filter(Boolean)
          .join("\n");
      }
      if (value && typeof value === "object") {
        if (typeof value.text === "string") return value.text;
        if (typeof value.content === "string") return value.content;
      }
      return null;
    };
    const { description, details, notes } = poi ?? {};
    const sources = [
      asString(description),
      asString(details?.description),
      asString(notes),
    ].filter((value) => typeof value === "string");
    const result = sources.find((value) => value.trim().length > 0);
    return result ? result.trim() : null;
  }, [poi]);
  const addressText = useMemo(() => {
    if (typeof poi?.address === "string") {
      const trimmed = poi.address.trim();
      return trimmed.length > 0 ? trimmed : null;
    }
    return null;
  }, [poi]);
  const tagList = useMemo(() => {
    if (!Array.isArray(poi?.tags)) return [];
    return poi.tags
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter((item) => item.length > 0);
  }, [poi]);
  const shouldShowPanel = !!poi && open && !isBike;
  return (
    <>
      {shouldShowPanel ? (
        <aside
          className={`detail-panel ${shouldShowPanel ? "open" : ""}`}
          aria-hidden={!shouldShowPanel}
        >
          <div className="detail-header" style={headerStyle}>
            {hasGallery ? (
              <button
                type="button"
                className="detail-header-trigger"
                onClick={() => openViewerAt(0)}
                aria-label="View photos"
              >
                <span className="sr-only">View photos</span>
                <span className="detail-header-trigger-hint" aria-hidden="true">
                  View photos
                </span>
              </button>
            ) : null}
            <button className="detail-close" onClick={onClose} aria-label="close">
              x
            </button>
          </div>
          <div className="detail-body">
            {poi ? (
              <div className="detail-content">
                <div className="detail-overview">
                  <div className="detail-title-row">
                    <h2 className="detail-name">
                      {poi?.name || "จุดวินมอเตอร์ไซค์"}
                    </h2>
                    <span className="detail-type">{categoryLabel}</span>
                  </div>
                  {distanceText ? (
                    <div className="detail-overview-meta">
                      <span className="detail-distance">
                        <svg
                          viewBox="0 0 24 24"
                          aria-hidden="true"
                          focusable="false"
                        >
                          <path
                            d="M12 2a7 7 0 0 0-7 7c0 4.2 5.21 11.06 6.21 12.29a1 1 0 0 0 1.58 0C13.79 20.06 19 13.2 19 9a7 7 0 0 0-7-7Zm0 10a3 3 0 1 1 3-3 3 3 0 0 1-3 3Z"
                            fill="currentColor"
                          />
                        </svg>
                        {distanceText}
                      </span>
                    </div>
                ) : null}
                </div>
                <section className="detail-section">
                  <div className="detail-section-title">ข้อมูลทั่วไป</div>
                  <div className="detail-info-grid">
                    <div className="detail-info-card">
                      <div className="detail-info-label">ที่ตั้ง</div>
                      <div
                        className={`detail-info-value${addressText ? "" : " muted"}`}
                      >
                        {addressText ?? "ไม่พบข้อมูล"}
                      </div>
                    </div>
                    <div className="detail-info-card">
                      <div className="detail-info-label">
                        ระยะห่างจากมหาวิทยาลัย
                      </div>
                      <div
                        className={`detail-info-value${distanceText ? "" : " muted"}`}
                      >
                        {distanceText ?? "ไม่พบข้อมูล"}
                      </div>
                    </div>
                  </div>
                </section>
                <section className="detail-section">
                  <div className="detail-section-title">รายละเอียด</div>
                  <div
                    className={`detail-description${descriptionText ? "" : " muted"}`}
                  >
                    {descriptionText ?? "ไม่มีรายละเอียดเพิ่มเติม"}
                  </div>
                </section>
                {tagList.length > 0 ? (
                  <section className="detail-section">
                    <div className="detail-section-title">บริการ / จุดสังเกต</div>
                    <div className="detail-tags">
                      {tagList.map((tag) => (
                        <span key={tag} className="detail-tag">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </section>
              ) : null}
                <section className="detail-section">
                  <div className="detail-section-title">การทำงาน</div>
                  <div className="detail-actions">
                    <div className="detail-action close-action">
                      <button className="btn ghost" onClick={onClose}>
                        ปิด
                      </button>
                    </div>
                  </div>
                </section>
              </div>
            ) : (
              <div className="detail-empty">
                เลือกวินมอเตอร์ไซค์จากแผนที่เพื่อดูรายละเอียด
              </div>
            )}
          </div>
        </aside>
      ) : null}
        {viewerOpen && hasGallery ? (
        <div
          className="image-viewer-overlay"
          role="dialog"
          aria-modal="true"
          onClick={handleCloseViewer}
        >
          <div
            className="image-viewer-dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="image-viewer-close"
              onClick={handleCloseViewer}
              aria-label="Close gallery"
            >
              x
            </button>
            <div className="image-viewer-main">
              {totalImages > 1 ? (
                <button
                  type="button"
                  className="image-viewer-nav prev"
                  onClick={handlePrevImage}
                  aria-label="Previous photo"
                >
                  {`<`}
                </button>
              ) : null}
              <div className="image-viewer-stage" style={stageStyle}>
                <img
                  src={imageUrls[viewerIndex]}
                  alt={`${poi?.name || "Win"} photo ${viewerIndex + 1} of ${totalImages}`}
                  style={imageStyle}
                  onLoad={handleImageLoad}
                  onError={handleImageError}
                />
                {totalImages > 1 ? (
                  <div className="image-viewer-counter">
                    {viewerIndex + 1} / {totalImages}
                  </div>
                ) : null}
              </div>
              {totalImages > 1 ? (
                <button
                  type="button"
                  className="image-viewer-nav next"
                  onClick={handleNextImage}
                  aria-label="Next photo"
                >
                  {`>`}
                </button>
              ) : null}
            </div>
            {totalImages > 1 ? (
              <div className="image-viewer-thumbs">
                {imageUrls.map((url, index) => (
                  <button
                    type="button"
                    key={`${url}-${index}`}
                    className={`image-viewer-thumb${viewerIndex === index ? " active" : ""}`}
                    onClick={() => openViewerAt(index)}
                    aria-label={`Show photo ${index + 1}`}
                  >
                    <img src={url} alt="" />
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
function CompareOverlay({
  baseDorm,
  options,
  pendingId,
  onPendingChange,
  onConfirm,
  onCancel,
}) {
  const baseRange = useMemo(() => extractPriceRange(baseDorm), [baseDorm]);
  const hasOptions = options && options.length > 0;
  return (
    <div className="compare-overlay">
      <div className="compare-overlay-card">
        <div className="compare-overlay-title">Selected dorm</div>
        <div className="compare-overlay-name">{baseDorm?.name || "Dorm"}</div>
        {baseRange ? (
          <div className="compare-overlay-price">
            {formatRangeText(baseRange)}
          </div>
        ) : (
          <div className="compare-overlay-price muted">No price data</div>
        )}
      </div>
      <div className="compare-overlay-card">
        <div className="compare-overlay-title">Choose another dorm</div>
        <select
          className="compare-overlay-select"
          value={pendingId || ""}
          onChange={(event) => onPendingChange?.(event.target.value || null)}
          disabled={!hasOptions}
        >
          <option value="">Select dorm...</option>
          {options.map((item) => (
            <option key={item._id} value={item._id}>
              {item.name || "Dorm"}
            </option>
          ))}
        </select>
        <div className="compare-overlay-actions">
          <button
            type="button"
            className="btn primary"
            onClick={onConfirm}
            disabled={!pendingId}
          >
            OK
          </button>
          <button type="button" className="btn" onClick={onCancel}>
            Cancel
          </button>
        </div>
        <div className="compare-overlay-note">
          Click a dorm marker or choose from the list, then press OK.
        </div>
        {!hasOptions && (
          <div className="compare-overlay-note">
            No other dorms are available in the list right now, but you can
            still pick one directly on the map.
          </div>
        )}
      </div>
    </div>
  );
}

