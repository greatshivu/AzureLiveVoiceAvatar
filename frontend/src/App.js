import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Navbar } from "@/components/Navbar";
import { LisaAvatar } from "@/components/LisaAvatar";
import OrderSearch from "@/pages/OrderSearch";
import ItemsSearch from "@/pages/ItemsSearch";

function App() {
  return (
    <div className="App min-h-screen bg-[#f8f9fa]">
      <BrowserRouter>
        <Navbar />
        <main>
          <Routes>
            <Route path="/" element={<Navigate to="/orders" replace />} />
            <Route path="/orders" element={<OrderSearch />} />
            <Route path="/items" element={<ItemsSearch />} />
            <Route path="*" element={<Navigate to="/orders" replace />} />
          </Routes>
        </main>
        <LisaAvatar />
      </BrowserRouter>
    </div>
  );
}

export default App;
