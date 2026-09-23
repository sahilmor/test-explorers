import { ImageResponse } from "next/og";
import { APP_NAME, APP_NAME_PARTS } from "@/lib/brand";
import { SITE_NAME } from "@/lib/site";

export const alt = `${APP_NAME} — run your school's tests online`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * The card that shows up when somebody pastes a link into WhatsApp or Slack.
 *
 * Generated rather than a checked-in PNG so it cannot drift from the brand,
 * and drawn with the same palette as app/globals.css — written as literals
 * because Satori resolves no CSS variables. Plain system type rather than the
 * display face: loading a variable font into the OG runtime is a lot of weight
 * for a 1200×630 image, and the colour and layout carry the identity.
 */
export default function OpengraphImage() {
  const INK = "#12100e";
  const PAPER = "#faf5e9";
  const LIME = "#c6f135";
  const CORAL = "#ff5a36";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: PAPER,
          padding: 72,
          fontFamily: "sans-serif",
        }}
      >
        {/* wordmark */}
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 999,
              border: `4px solid ${INK}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div style={{ width: 18, height: 18, borderRadius: 999, background: LIME }} />
          </div>
          <div style={{ display: "flex", fontSize: 34, fontWeight: 800, letterSpacing: -1 }}>
            <span style={{ color: INK }}>{APP_NAME_PARTS.head}</span>
            <span style={{ color: CORAL }}>{APP_NAME_PARTS.tail}</span>
          </div>
        </div>

        {/* headline */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              fontSize: 96,
              fontWeight: 800,
              letterSpacing: -4,
              lineHeight: 1.02,
              color: INK,
            }}
          >
            <span>Run your tests&nbsp;</span>
            <span
              style={{
                background: LIME,
                padding: "0 18px",
                border: `4px solid ${INK}`,
                borderRadius: 10,
              }}
            >
              online
            </span>
          </div>

          <div style={{ display: "flex", marginTop: 28, fontSize: 30, color: "#5a544c" }}>
            Set a paper once. Marked before the bell.
          </div>
        </div>

        {/* OMR strip — the product's one repeated motif */}
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
          <div style={{ display: "flex", gap: 12 }}>
            {[LIME, CORAL, "#2b3dff", LIME, INK, LIME, CORAL, LIME].map((fill, i) => (
              <div
                key={i}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 999,
                  border: `4px solid ${INK}`,
                  background: i % 3 === 0 ? fill : "transparent",
                }}
              />
            ))}
          </div>
          <div style={{ display: "flex", fontSize: 24, fontWeight: 700, color: INK }}>
            {SITE_NAME}
          </div>
        </div>
      </div>
    ),
    size
  );
}
