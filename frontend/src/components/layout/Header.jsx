import "./Header.css";

function Header() {
  return (
    <header className="header">
      <h2>MILO AI</h2>

      <div className="status">
        <span className="dot"></span>
        Online
      </div>
    </header>
  );
}

export default Header;