import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Navbar } from "@/components/Navbar";
import { LisaAvatar } from "@/components/LisaAvatar";
import SearchPage from "@/pages/SearchPage";
import { PAGES } from "@/config/pages";

function App() {
  return (
    <div className="App min-h-screen bg-[#f8f9fa]">
      <BrowserRouter>
        <Navbar />
        <main>
          <Routes>
            <Route path="/" element={<Navigate to={PAGES[0].route} replace />} />
            {PAGES.map((p) => (
              <Route key={p.key} path={p.route} element={<SearchPage key={p.key} page={p} />} />
            ))}
            <Route path="*" element={<Navigate to={PAGES[0].route} replace />} />
          </Routes>
        </main>
        <LisaAvatar />
      </BrowserRouter>
    </div>
  );
}

export default App;
