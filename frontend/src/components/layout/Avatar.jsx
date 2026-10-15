import "./Avatar.css";
import mouthClosed from "../../assets/milo-mouth-closed.png";
import mouthOpen from "../../assets/milo-mouth-open.png";

function Avatar({ mouthLevel = 0, speaking = false }) {
  const bars = [0.4, 0.7, 1, 0.6, 0.9, 0.5, 0.3];

  return (
    <div>
      <div className={`avatar-outer ${speaking ? "speaking" : ""}`}>
        <div className="avatar-ring"></div>
        <div className="avatar-wrap">
          <img src={mouthClosed} alt="Milo" className="avatar-img avatar-base" />
          <img
            src={mouthOpen}
            alt=""
            className="avatar-img avatar-mouth-open"
            style={{ opacity: mouthLevel }}
          />
        </div>
      </div>

      <div className="avatar-bars">
        {bars.map((mult, i) => (
          <div
            key={i}
            className="bar"
            style={{
              height: speaking ? `${4 + mouthLevel * 32 * mult}px` : "4px",
            }}
          ></div>
        ))}
      </div>
    </div>
  );
}

export default Avatar;