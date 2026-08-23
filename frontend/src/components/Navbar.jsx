import { NavLink } from "react-router-dom";
import { Package, ShoppingCart, Sparkle } from "@phosphor-icons/react";

export const Navbar = () => {
  const linkBase =
    "flex items-center gap-2 px-4 py-2 text-sm font-medium tracking-tight border-b-2 transition-colors";
  const active = "border-blue-600 text-slate-900";
  const inactive = "border-transparent text-slate-500 hover:text-slate-900";

  return (
    <header
      data-testid="app-header"
      className="sticky top-0 z-40 w-full border-b border-slate-200 bg-white"
    >
      <div className="max-w-7xl mx-auto px-6 md:px-8 flex items-center justify-between h-16">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-lg bg-slate-900 flex items-center justify-center">
            <Sparkle size={20} weight="fill" className="text-white" />
          </div>
          <div className="leading-none">
            <p className="font-heading text-base font-bold tracking-tight text-slate-900">
              Nexus Console
            </p>
            <p className="text-[11px] text-slate-400 font-medium">Enterprise Search</p>
          </div>
        </div>

        <nav className="flex items-center h-full">
          <NavLink
            to="/orders"
            data-testid="nav-orders"
            className={({ isActive }) => `${linkBase} ${isActive ? active : inactive} h-16`}
          >
            <ShoppingCart size={18} weight="regular" />
            Order Search
          </NavLink>
          <NavLink
            to="/items"
            data-testid="nav-items"
            className={({ isActive }) => `${linkBase} ${isActive ? active : inactive} h-16`}
          >
            <Package size={18} weight="regular" />
            Items Search
          </NavLink>
        </nav>
      </div>
    </header>
  );
};
