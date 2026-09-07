"use client";

import ZoomSlider from "@/components/ui/zoom-slider";

export default function ZoomSliderDemo() {
  return (
    <div className="w-full">
      <ZoomSlider
        scaleOnHover
        textOnHover
        size={1}
        easeScrollPercentage={100}
      />
    </div>
  );
}
