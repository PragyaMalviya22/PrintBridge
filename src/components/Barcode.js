"use client";
import { useRef, useEffect } from "react";
import JsBarcode from "jsbarcode";
export default function Barcode({ value, width = 1.5, height = 40 }) {
  const ref = useRef();
  useEffect(() => {
    if (ref.current && value) {
      try { JsBarcode(ref.current, value, { format: "CODE128", width, height, displayValue: true, fontSize: 10, font: "JetBrains Mono", margin: 4, background: "transparent" }); } catch (_) {}
    }
  }, [value, width, height]);
  return <svg ref={ref} />;
}
