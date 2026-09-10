import "@/App.css";
import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Navbar } from "@/components/Navbar";
import { LisaAvatar } from "@/components/LisaAvatar";
import SearchPage from "@/pages/SearchPage";
import { PAGES, onPagesUpdated } from "@/config/pages";

function App() {
  const [pages, setPages] = useState(PAGES);

  useEffect(() => {
    return onPagesUpdated((updated) => setPages([...updated]));
  }, []);

  const defaultRoute = pages[0]?.route || "/orders";

  return (
    <div className="App min-h-screen bg-[#f8f9fa]">
      <BrowserRouter>
        <Navbar />
        <main>
          <Routes>
            <Route path="/" element={<Navigate to={defaultRoute} replace />} />
            {pages.map((p) => (
              <Route key={p.key} path={p.route} element={<SearchPage key={p.key} page={p} />} />
            ))}
            <Route path="*" element={<Navigate to={defaultRoute} replace />} />
          </Routes>
        </main>
        <LisaAvatar />
      </BrowserRouter>
    </div>
  );
}

export default App;
