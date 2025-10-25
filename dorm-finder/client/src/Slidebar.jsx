import { useState } from "react";
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

const CATEGORIES = [
  { name: "หอพัก", icon: dormIcon },
  { name: "7-11", icon: sevenIcon },
  { name: "ร้านขายยา", icon: pharmacyIcon },
  { name: "ร้านอาหาร", icon: restaurantIcon },
  { name: "ร้านซักผ้า", icon: laundryIcon },
  { name: "ร้านเหล้า", icon: beerIcon },
  { name: "วินมอเตอร์ไซค์", icon: motorbikeIcon },
  { name: "ร้านถ่ายเอกสาร", icon: printerIcon },
  { name: "ตู้ ATM", icon: atmIcon },
  { name: "ร้านตัดผม", icon: barberIcon },
];

export default function Slidebar({ onBack }) {
  const [query, setQuery] = useState("");

  const handleBack = () => {
    if (typeof onBack === "function") {
      onBack();
      return;
    }
    if (typeof window !== "undefined" && window.history && typeof window.history.back === "function") {
      window.history.back();
    }
  };

  return (
    <aside className="sidebar-panel open" aria-hidden={false}>
      <div className="sidebar-top">
        <div className="sidebar-title">Dorm-Finder</div>
        <button
          type="button"
          className="sidebar-back-button"
          onClick={handleBack}
          aria-label="Back"
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
        <span className="sidebar-search-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" focusable="false">
            <circle cx="11" cy="11" r="6" stroke="currentColor" strokeWidth="2" fill="none" />
            <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </span>
        <input
          type="text"
          placeholder="Search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="sidebar-search-input"
        />
      </div>
      <nav className="sidebar-menu" aria-label="Categories">
        {CATEGORIES.map((category) => (
          <button key={category.name} type="button" className="menu-item">
            <img src={category.icon} alt="" className="menu-item-icon" />
            <span className="menu-item-label">{category.name}</span>
          </button>
        ))}
      </nav>
    </aside>
  );
}
