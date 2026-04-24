"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

interface Tab {
  label: string;
  href: string;
}

const tabs: Tab[] = [
  { label: "Marché", href: "/events" },
  { label: "Livraisons", href: "/deliveries" },
  { label: "Paiements", href: "/payments" },
  { label: "Commandes", href: "/commandes" },
  { label: "Produits", href: "/products" },
  { label: "Stockage", href: "/storage" },
  { label: "Types", href: "/types" },
  { label: "Mod\u00e8les", href: "/models" },
];

export default function Nav() {
  const pathname: string = usePathname();
  const [isOpen, setIsOpen] = useState<boolean>(false);

  const close = useCallback((): void => {
    setIsOpen(false);
  }, []);

  useEffect((): void => {
    close();
  }, [pathname, close]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        close();
      }
    }

    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen, close]);

  return (
    <>
      <button
        type="button"
        className={`sidebar-toggle ${isOpen ? "sidebar-toggle-open" : ""}`}
        onClick={() => setIsOpen((previous: boolean): boolean => !previous)}
        aria-label={isOpen ? "Fermer le menu" : "Ouvrir le menu"}
        aria-expanded={isOpen}
      >
        <span className="sidebar-toggle-bar" />
        <span className="sidebar-toggle-bar" />
        <span className="sidebar-toggle-bar" />
      </button>

      <div
        className={`sidebar-overlay ${isOpen ? "sidebar-overlay-visible" : ""}`}
        onClick={close}
        aria-hidden="true"
      />

      <nav
        className={`sidebar ${isOpen ? "sidebar-open" : ""}`}
        aria-label="Navigation principale"
      >
        <div className="sidebar-links">
          {tabs.map((tab: Tab) => {
            const isActive: boolean = pathname.startsWith(tab.href);

            return (
              <Link
                key={tab.href}
                href={tab.href}
                onClick={close}
                className={`sidebar-link ${isActive ? "sidebar-link-active" : ""}`}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>

        {/* Decorative vine on the sidebar's right edge */}
        <div className="sidebar-vine" aria-hidden="true" />
      </nav>
    </>
  );
}
