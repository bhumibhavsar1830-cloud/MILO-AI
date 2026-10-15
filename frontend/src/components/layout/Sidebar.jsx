import "./Sidebar.css";

const navItems = [
  { icon: "🏠", label: "Home" },
  { icon: "💬", label: "Chat" },
  { icon: "🎤", label: "Voice" },
  { icon: "⚙️", label: "Settings" },
];

function Sidebar({ activePage, onNavigate }) {
  return (
    <aside className="sidebar">
      <div className="logo">M</div>

      <nav className="nav">
        {navItems.map((item, index) => (
          <div
            className={`nav-item ${activePage === item.label ? "active" : ""}`}
            key={index}
            onClick={() => onNavigate(item.label)}
          >
            <span className="nav-icon">{item.icon}</span>
            <span>{item.label}</span>
          </div>
        ))}
      </nav>

      <div className="version">
        MILO AI
        <br />
        v0.2
      </div>
    </aside>
  );
}

export default Sidebar;