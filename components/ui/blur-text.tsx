"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";

interface BlurTextProps {
  text: string;
  delay?: number;
  animateBy?: "words" | "letters";
  direction?: "top" | "bottom";
  className?: string;
  style?: React.CSSProperties;
  trigger?: boolean;
}

const BlurText: React.FC<BlurTextProps> = ({
  text,
  delay = 50,
  animateBy = "words",
  direction = "top",
  className = "",
  style,
  trigger,
}) => {
  const [inView, setInView] = useState(false);
  const ref = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    // Failsafe fallback: guarantee inView becomes true even if IntersectionObserver is delayed or throttled by browser shields
    const fallbackTimer = setTimeout(() => {
      setInView(true);
    }, 150);

    const currentElement = ref.current;
    if (!currentElement) return () => clearTimeout(fallbackTimer);

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          clearTimeout(fallbackTimer);
        }
      },
      { threshold: 0.01 }
    );

    observer.observe(currentElement);

    return () => {
      clearTimeout(fallbackTimer);
      observer.unobserve(currentElement);
    };
  }, []);

  const shouldAnimate = inView && (trigger !== undefined ? trigger : true);

  const segments = useMemo(() => {
    return animateBy === "words" ? text.split(" ") : text.split("");
  }, [text, animateBy]);

  return (
    <p
      ref={ref}
      className={`inline-flex ${animateBy === "words" ? "flex-wrap" : "flex-nowrap"} ${className}`}
      style={style}
    >
      {segments.map((segment, i) => (
        <span
          key={i}
          style={{
            display: "inline-block",
            filter: shouldAnimate ? "blur(0px)" : "blur(14px)",
            opacity: shouldAnimate ? 1 : 0,
            transform: shouldAnimate
              ? "translateY(0)"
              : `translateY(${direction === "top" ? "-32px" : "32px"})`,
            transition: `all 0.6s cubic-bezier(0.16, 1, 0.3, 1) ${i * delay}ms`,
            willChange: "transform, filter, opacity",
          }}
        >
          {segment}
          {animateBy === "words" && i < segments.length - 1 ? "\u00A0" : ""}
        </span>
      ))}
    </p>
  );
};

export default BlurText;
