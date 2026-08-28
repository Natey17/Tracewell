import { NavLink, Route, Routes } from "react-router-dom";
import { Overview } from "./pages/Overview";
import { Incidents } from "./pages/Incidents";
import { IncidentDetail } from "./pages/IncidentDetail";
import { Orders } from "./pages/Orders";

function NavItem({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <NavLink to={to} end={to === "/"} className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
      {children}
    </NavLink>
  );
}

export function App() {
  return (
    <>
      <aside className="sidebar">
        <div className="brand">
          Tracewell<span className="brand-dot">.</span>
        </div>
        <NavItem to="/">Overview</NavItem>
        <NavItem to="/incidents">Incidents</NavItem>
        <NavItem to="/orders">Orders</NavItem>
      </aside>
      <main className="main">
        <Routes>
          <Route path="/" element={<Overview />} />
          <Route path="/incidents" element={<Incidents />} />
          <Route path="/incidents/:id" element={<IncidentDetail />} />
          <Route path="/orders" element={<Orders />} />
        </Routes>
      </main>
    </>
  );
}
