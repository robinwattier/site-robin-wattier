"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";

interface PreloaderProps {
  isLoading: boolean;
}

export const Preloader: React.FC<PreloaderProps> = ({ isLoading }) => {
  return (
    <AnimatePresence>
      {isLoading && (
        <motion.div
          key="intro-splash"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black select-none pointer-events-none"
        >
          <div className="relative flex flex-col items-center justify-center">
            {/* The Centered RW Logo with Shared Layout FLIP */}
            <motion.div
              layoutId="rw-brand-logo"
              transition={{
                type: "spring",
                stiffness: 130,
                damping: 19,
                mass: 0.9,
              }}
              className="text-2xl xs:text-3xl sm:text-4xl md:text-4xl font-bold select-none cursor-default tracking-wide"
              style={{
                fontFamily: "var(--font-logo), 'KCY2KBanger-Bold', sans-serif",
                color: "#ffffff",
              }}
            >
              RW
            </motion.div>

            {/* Subtle Buttermax-style Kinetic Line */}
            <motion.div
              initial={{ scaleX: 0, opacity: 0 }}
              animate={{ scaleX: 1, opacity: 1 }}
              exit={{ scaleX: 0, opacity: 0, transition: { duration: 0.25 } }}
              transition={{
                duration: 0.8,
                delay: 0.15,
                ease: [0.16, 1, 0.3, 1],
              }}
              className="w-8 sm:w-10 h-[1.5px] bg-[#C3E41D] mt-3 origin-center rounded-full"
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default Preloader;
