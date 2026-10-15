import "./Orb.css";

function Orb() {
  return (
    <div className="orb-stage">
      <span className="bracket tl"></span>
      <span className="bracket tr"></span>
      <span className="bracket bl"></span>
      <span className="bracket br"></span>

      <div className="orb-wrapper">
        <div className="orb">
          <div className="core"></div>
          <div className="ring ring1"></div>
          <div className="ring ring2"></div>
          <div className="arc"></div>
        </div>

        <h1>MILO AI</h1>

        <div className="waveform">
          <span></span><span></span><span></span><span></span><span></span>
        </div>

        <p className="status">
          <span className="dot"></span>
          Waiting for "Hey Milo"
        </p>
      </div>
    </div>
  );
}

export default Orb;