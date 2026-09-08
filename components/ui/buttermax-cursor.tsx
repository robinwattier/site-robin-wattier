"use client";

import React, { useEffect, useState, useSyncExternalStore } from "react";
import { motion, useMotionValue, useSpring, animate } from "framer-motion";

interface ButtermaxCursorProps {
  isDark?: boolean;
}

export const ButtermaxCursor: React.FC<ButtermaxCursorProps> = ({
  isDark = true,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isClicked, setIsClicked] = useState(false);

  const isFinePointer = useSyncExternalStore(
    (callback) => {
      if (typeof window === "undefined") return () => {};
      const mq = window.matchMedia("(pointer: fine)");
      mq.addEventListener("change", callback);
      return () => mq.removeEventListener("change", callback);
    },
    () => (typeof window !== "undefined" ? window.matchMedia("(pointer: fine)").matches : true),
    () => true
  );
  const isTouchDevice = !isFinePointer;

  // Mouse position values
  const mouseX = useMotionValue(-100);
  const mouseY = useMotionValue(-100);

  // Buttery-smooth spring physics (Buttermax style)
  const springConfig = { damping: 28, stiffness: 350, mass: 0.5 };
  const cursorX = useSpring(mouseX, springConfig);
  const cursorY = useSpring(mouseY, springConfig);

  useEffect(() => {
    let magnetAnimationX: { stop: () => void } | null = null;
    let magnetAnimationY: { stop: () => void } | null = null;
    let realMousePos: { x: number; y: number } | null = null;
    let isMagnetized = false;

    const handleUnmagnet = () => {
      if (!isMagnetized) return;
      isMagnetized = false;

      magnetAnimationX?.stop();
      magnetAnimationY?.stop();

      setIsHovered(false);

      if (realMousePos) {
        animate(mouseX, realMousePos.x, {
          type: "spring",
          damping: 26,
          stiffness: 300,
          mass: 0.5,
        });
        animate(mouseY, realMousePos.y, {
          type: "spring",
          damping: 26,
          stiffness: 300,
          mass: 0.5,
        });
      }
    };

    const handleMagnet = (e: Event) => {
      const customEvent = e as CustomEvent<{ x: number; y: number; isHovered?: boolean }>;
      const { x, y, isHovered: hoverState } = customEvent.detail || {};

      if (typeof x === "number" && typeof y === "number") {
        isMagnetized = true;
        setIsVisible(true);
        if (typeof hoverState === "boolean") {
          setIsHovered(hoverState);
        }

        magnetAnimationX?.stop();
        magnetAnimationY?.stop();

        if (mouseX.get() < 0) {
          mouseX.set(x);
          mouseY.set(y);
          cursorX.set(x);
          cursorY.set(y);
        } else {
          magnetAnimationX = animate(mouseX, x, {
            type: "spring",
            damping: 24,
            stiffness: 240,
            mass: 0.5,
          });

          magnetAnimationY = animate(mouseY, y, {
            type: "spring",
            damping: 24,
            stiffness: 240,
            mass: 0.5,
          });
        }
      }
    };

    window.addEventListener("rw-magnet-cursor", handleMagnet as EventListener);
    window.addEventListener("rw-unmagnet-cursor", handleUnmagnet as EventListener);

    const handleMouseMove = (e: MouseEvent) => {
      realMousePos = { x: e.clientX, y: e.clientY };

      if (isMagnetized) {
        isMagnetized = false;
        magnetAnimationX?.stop();
        magnetAnimationY?.stop();
      }

      mouseX.set(e.clientX);
      mouseY.set(e.clientY);
      setIsVisible((prev) => (prev ? prev : true));

      // Check if hovering over interactive elements
      const target = e.target as HTMLElement | null;
      if (target) {
        const interactive = target.closest(
          "a, button, [role='button'], [role='menuitem'], input, textarea"
        );
        setIsHovered(!!interactive);
      }
    };

    const handleMouseDown = () => setIsClicked(true);
    const handleMouseUp = () => setIsClicked(false);
    const handleMouseLeave = () => setIsVisible(false);
    const handleMouseEnter = () => setIsVisible((prev) => (prev ? prev : true));

    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    window.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mouseup", handleMouseUp);
    document.addEventListener("mouseleave", handleMouseLeave);
    document.addEventListener("mouseenter", handleMouseEnter);

    return () => {
      magnetAnimationX?.stop();
      magnetAnimationY?.stop();
      window.removeEventListener("rw-magnet-cursor", handleMagnet as EventListener);
      window.removeEventListener("rw-unmagnet-cursor", handleUnmagnet as EventListener);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mouseup", handleMouseUp);
      document.removeEventListener("mouseleave", handleMouseLeave);
      document.removeEventListener("mouseenter", handleMouseEnter);
    };
  }, [mouseX, mouseY, cursorX, cursorY]);

  if (isTouchDevice || !isVisible) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[9999] overflow-hidden">
      {/* Outer Buttermax Smooth Ring */}
      <motion.div
        className="pointer-events-none fixed top-0 left-0 rounded-full border transition-colors duration-200 will-change-transform"
        style={{
          x: cursorX,
          y: cursorY,
          translateX: "-50%",
          translateY: "-50%",
          borderColor: isHovered
            ? "#C3E41D"
            : isDark
              ? "rgba(255, 255, 255, 0.4)"
              : "rgba(10, 10, 10, 0.4)",
          backgroundColor: isHovered
            ? "rgba(195, 228, 29, 0.15)"
            : "transparent",
        }}
        animate={{
          width: isHovered ? 48 : isClicked ? 24 : 32,
          height: isHovered ? 48 : isClicked ? 24 : 32,
          scale: isClicked ? 0.9 : 1,
        }}
        transition={{
          type: "spring",
          stiffness: 400,
          damping: 25,
        }}
      />

      {/* Inner Central Dot */}
      <motion.div
        className="pointer-events-none fixed top-0 left-0 rounded-full will-change-transform"
        style={{
          x: mouseX,
          y: mouseY,
          translateX: "-50%",
          translateY: "-50%",
          backgroundColor: isHovered
            ? "#C3E41D"
            : isDark
              ? "#ffffff"
              : "#0a0a0a",
        }}
        animate={{
          width: isHovered ? 6 : isClicked ? 3 : 5,
          height: isHovered ? 6 : isClicked ? 3 : 5,
          opacity: isHovered ? 0.8 : 1,
        }}
        transition={{
          duration: 0.15,
        }}
      />
    </div>
  );
};

export default ButtermaxCursor;
