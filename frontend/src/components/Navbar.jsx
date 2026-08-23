import { NavLink } from "react-router-dom";
import { Package, ShoppingCart, Sparkle, Table, Files } from "@phosphor-icons/react";
import { PAGES } from "../config/pages";

const ICONS = { cart: ShoppingCart, package: Package, table: Table, files: Files };

export const Navbar = () => {
  const linkBase = "flex items-center gap-2 px-4 py-2 text-sm font-medium tracking-tight border-b-2 transition-colors h-16";
  const active = "border-blue-600 text-slate-900";
  const inactive = "border-transparent text-slate-500 hover:text-slate-900";

  return (
    <header data-testid="app-header" className="sticky top-0 z-40 w-full border-b border-slate-200 bg-white">
      <div className="max-w-7xl mx-auto px-6 md:px-8 flex items-center justify-between h-16">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-lg bg-slate-900 flex items-center justify-center">
            <Sparkle size={20} weight="fill" className="text-white" />
          </div>
          <div className="leading-none">
            <p className="font-heading text-base font-bold tracking-tight text-slate-900">Nexus Console</p>
            <p className="text-[11px] text-slate-400 font-medium">Enterprise Search</p>
          </div>
        </div>

        <nav className="flex items-center h-full">
          {PAGES.map((p) => {
            const Icon = ICONS[p.navIcon] || Table;
            return (
              <NavLink
                key={p.key}
                to={p.route}
                data-testid={`nav-${p.key}`}
                className={({ isActive }) => `${linkBase} ${isActive ? active : inactive}`}
              >
                <Icon size={18} weight="regular" />
                {p.title}
              </NavLink>
            );
          })}
        </nav>
      </div>
    </header>
  );
};
