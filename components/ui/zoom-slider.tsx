'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { SplitText } from 'gsap/SplitText';
import { ScrollToPlugin } from 'gsap/ScrollToPlugin';

if (typeof window !== 'undefined') {
  gsap.registerPlugin(SplitText, ScrollToPlugin);
}

import { assetUrl } from '@/lib/utils';

const VAULT_IMAGES = [
  assetUrl('/projects/project-1.jpg'),
  assetUrl('/projects/project-2.jpg'),
  assetUrl('/projects/project-3.jpg'),
  assetUrl('/projects/project-4.jpg'),
  assetUrl('/projects/project-5.jpg'),
  assetUrl('/projects/project-6.jpg'),
  assetUrl('/projects/project-7.jpg'),
  assetUrl('/projects/project-8.jpg'),
];

const DEFAULT_SLIDER_DATA: ZoomSliderItem[] = [
  { number: "01", src: VAULT_IMAGES[0 % VAULT_IMAGES.length], title: "AURA", desc: "Soft light and atmospheric tones" },
  { number: "02", src: VAULT_IMAGES[1 % VAULT_IMAGES.length], title: "DRIFT", desc: "Floating through silence" },
  { number: "03", src: VAULT_IMAGES[2 % VAULT_IMAGES.length], title: "FORM", desc: "Shapes carved by light" },
  { number: "04", src: VAULT_IMAGES[3 % VAULT_IMAGES.length], title: "FLOW", desc: "Smooth transitions in motion" },
  { number: "05", src: VAULT_IMAGES[4 % VAULT_IMAGES.length], title: "DEPTH", desc: "Layers and visual weight" },
  { number: "06", src: VAULT_IMAGES[5 % VAULT_IMAGES.length], title: "ENERGY", desc: "Movement captured in time" },
  { number: "07", src: VAULT_IMAGES[6 % VAULT_IMAGES.length], title: "GLITCH", desc: "Breaking visual boundaries" },
  { number: "08", src: VAULT_IMAGES[7 % VAULT_IMAGES.length], title: "FRAME-X", desc: "Cinematic still frame" },
  { number: "09", src: VAULT_IMAGES[8 % VAULT_IMAGES.length], title: "LIGHTPLAY", desc: "Contrast and highlights" },
  { number: "10", src: VAULT_IMAGES[9 % VAULT_IMAGES.length], title: "MINIMAL", desc: "Less but stronger" },
];

const SCROLL_PER_PX = 1.0;
const LERP_FACTOR = 0.08;

const DRAG_LERP_FACTOR = 0.22;
const MOMENTUM_FRICTION = 0.92;
const MIN_MOMENTUM = 0.1;
const MOBILE_BREAKPOINT = 640;
const TABLET_BREAKPOINT = 1025;
const SLIDER_BOTTOM_OFFSET = 0;

const REDUCED_MOTION_LERP_FACTOR = 0.08;
const REDUCED_MOTION_FADE_DURATION = 0.18;

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  false;

const lerp = (a: number, b: number, n: number): number => a + (b - a) * n;

export interface ZoomSliderItem {
  number: string;
  src: string;
  title: string;
  desc: string;
}

interface ZoomSliderCompProps {
  sliderData: ZoomSliderItem[];
  title?: React.ReactNode;
  subheading?: string;
  scaleOnHover?: boolean;
  textOnHover?: boolean;
  size?: number;
  easeScrollPercentage?: number;
  className?: string;
}

export function ZoomSliderComp({
  sliderData,
  title,
  subheading,
  scaleOnHover = true,
  textOnHover = true,
  size = 1,
  easeScrollPercentage = 100,
  className,
}: ZoomSliderCompProps) {
  const images = sliderData;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const stripRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const imageWrapRefs = useRef<(HTMLDivElement | null)[]>([]);
  const textRefs = useRef<(HTMLDivElement | null)[]>([]);
  const titleWrapRef = useRef<HTMLHeadingElement | null>(null);
  const proRef = useRef<HTMLSpanElement | null>(null);
  const jectsRef = useRef<HTMLSpanElement | null>(null);
  const letterRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const subheadingRef = useRef<HTMLParagraphElement | null>(null);
  const wasAtHomeRef = useRef(true);

  const [viewportWidth, setViewportWidth] = useState(1440);
  const [viewportHeight, setViewportHeight] = useState(900);
  const [reduceMotion, setReduceMotion] = useState(false);

  const isMobile = viewportWidth < MOBILE_BREAKPOINT;
  const isTablet =
    viewportWidth >= MOBILE_BREAKPOINT && viewportWidth < TABLET_BREAKPOINT;

  const resolvedSize = Math.max(0.5, Number(size) || 1);
  const resolvedEaseScrollPercentage = Math.max(20, Number(easeScrollPercentage) || 100);
  const cardWidthMin = (isMobile ? 75 : 190) * resolvedSize;
  const cardWidthMax = (isMobile ? 260 : isTablet ? 500 : 680) * resolvedSize;
  const cardHeightMax = isMobile
    ? Math.round(viewportHeight * 0.6 * resolvedSize)
    : Math.round(viewportHeight * 0.82 * resolvedSize);
  const cardHeightMin = (isMobile ? 80 : 50) * resolvedSize;
  const cardStep = cardWidthMax;

  const stateRef = useRef({
    current: 0,
    target: 0,
    raf: null as number | null,
    isDragging: false,
    lastX: 0,
    lastY: 0,
    velocity: 0,
  });
  const [activeIndex, setActiveIndex] = useState(0);
  const announcedIndexRef = useRef(0);
  const isTransitioningRef = useRef(false);
  const cooldownRef = useRef(0);

  useEffect(() => {
    const onResize = () => {
      setViewportWidth(window.innerWidth);
      setViewportHeight(window.innerHeight);
    };

    onResize();
    window.addEventListener('resize', onResize);

    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia?.(
      '(prefers-reduced-motion: reduce)'
    );

    const syncReducedMotion = (event: MediaQueryList | MediaQueryListEvent) => {
      setReduceMotion(
        'matches' in event ? event.matches : prefersReducedMotion()
      );
    };

    if (!mediaQuery) return;

    syncReducedMotion(mediaQuery);
    mediaQuery.addEventListener('change', syncReducedMotion);
    return () => mediaQuery.removeEventListener('change', syncReducedMotion);
  }, []);

  const positionCards = useCallback(
    (offset: number) => {
      if (!stripRef.current) return;

      const cards = Array.from(stripRef.current.children) as HTMLElement[];
      const count = images.length;

      if (!count) return;

      const containerWidth = containerRef.current?.clientWidth || (typeof window !== 'undefined' ? window.innerWidth : 1440);
      const containerHeight = containerRef.current?.clientHeight || (typeof window !== 'undefined' ? window.innerHeight : 900);
      const viewportWidthValue = containerWidth;
      const viewportHeightValue = containerHeight;
      const bottom = viewportHeightValue - SLIDER_BOTTOM_OFFSET;
      const easingDistance = 2 * viewportWidthValue * (resolvedEaseScrollPercentage / 100);

      const mapVtoX = (value: number) => {
        if (value <= 0) return 0;
        if (value >= easingDistance) return value - easingDistance / 2;
        return (value * value) / (2 * easingDistance);
      };

      const maxTarget = (count - 1) * cardStep;
      const clampedOffset = Math.max(0, Math.min(maxTarget, offset));
      const startIndex = Math.floor(clampedOffset / cardStep);
      const fractionalOffset = (clampedOffset % cardStep) / cardStep;

      for (let step = -1; step < count - 1; step += 1) {
        const cardIndex = ((startIndex + step) % count + count) % count;
        const vEnd = easingDistance - (step - fractionalOffset) * cardStep;
        const vStart = vEnd - cardStep;
        const currentX = mapVtoX(vStart);
        const nextX = mapVtoX(vEnd);
        const visualWidth = Math.max(0, nextX - currentX);
        const scale = Math.min(1, visualWidth / cardWidthMax);
        const cardHeight =
          cardHeightMin + scale * (cardHeightMax - cardHeightMin);
        const y = bottom - cardHeight;

        if (!cards[cardIndex]) continue;

        const isOffScreenRight = currentX >= viewportWidthValue - 1;
        const isHidden = visualWidth <= 2 || isOffScreenRight;

        cards[cardIndex].style.transform = `translate(${currentX}px, ${y}px)`;
        cards[cardIndex].style.width = `${visualWidth}px`;
        cards[cardIndex].style.zIndex = String(Math.max(1, count - step));
        cards[cardIndex].style.visibility = isHidden ? 'hidden' : 'visible';
        cards[cardIndex].style.pointerEvents = isHidden ? 'none' : 'auto';

        const imageWrap = imageWrapRefs.current[cardIndex];

        if (!imageWrap) continue;

        imageWrap.style.width = `${visualWidth}px`;
        imageWrap.style.height = `${cardHeight}px`;
      }
    },
    [cardHeightMax, cardHeightMin, cardStep, cardWidthMax, images.length, resolvedEaseScrollPercentage]
  );

  useEffect(() => {
    if (!images.length) return;

    const state = stateRef.current;
    const maxTarget = (images.length - 1) * cardStep;

    const updateTitleProgress = () => {
      if (!containerRef.current || typeof window === 'undefined') return;

      if (reduceMotion) {
        for (let i = 0; i < 8; i++) {
          const el = letterRefs.current[i];
          if (el) {
            el.style.opacity = '1';
            el.style.transform = 'none';
            el.style.filter = 'none';
          }
        }
        if (subheadingRef.current) {
          subheadingRef.current.style.opacity = '0.65';
          subheadingRef.current.style.transform = 'none';
          subheadingRef.current.style.filter = 'none';
        }
        if (titleWrapRef.current) {
          titleWrapRef.current.style.opacity = '1';
          titleWrapRef.current.style.transform = 'none';
        }
        return;
      }

      const rect = containerRef.current.getBoundingClientRect();
      const viewportHeight = window.innerHeight;

      // 1. Entrance (Home -> Projects):
      // When at Home: rect.top = viewportHeight -> enterProgress = 0
      // When at Projects: rect.top = 0 -> enterProgress = 1
      const rawEnter = (viewportHeight - rect.top) / viewportHeight;
      const enterProgress = Math.max(0, Math.min(1, rawEnter));

      // 2. Exit (Projects -> Contact):
      // When at Projects: rect.top = 0 -> exitProgress = 0
      // When scrolling down towards Contact: rect.top < 0 -> exitProgress goes from 0 to 1
      const rawExit = -rect.top / (viewportHeight * 0.7);
      const exitProgress = Math.max(0, Math.min(1, rawExit));

      // Progressive character reveal for each of the 8 letters (P-R-O-J-E-C-T-S)
      // Letters stagger across the scroll progress with unblur + float
      for (let i = 0; i < 8; i++) {
        const el = letterRefs.current[i];
        if (!el) continue;

        // Entrance window for letter i: starts at 0.05 + i * 0.08, duration 0.22
        const startEnter = 0.05 + i * 0.08;
        const pEnter = Math.max(0, Math.min(1, (enterProgress - startEnter) / 0.22));

        // Exit window for letter i: starts at i * 0.06, duration 0.24
        const startExit = i * 0.06;
        const pExit = Math.max(0, Math.min(1, (exitProgress - startExit) / 0.24));

        const pFinal = Math.max(0, pEnter * (1 - pExit));
        const yOffset = (1 - pEnter) * 36 - pExit * 28;
        const blur = (1 - pFinal) * 12;
        const scale = 0.92 + pFinal * 0.08;

        el.style.opacity = String(pFinal.toFixed(3));
        el.style.transform = `translateY(${yOffset.toFixed(1)}px) scale(${scale.toFixed(3)})`;
        el.style.filter = blur > 0.1 ? `blur(${blur.toFixed(1)}px)` : 'none';
      }

      // Subheading reveal (appears after letters are revealed)
      if (subheadingRef.current) {
        const pSubEnter = Math.max(0, Math.min(1, (enterProgress - 0.72) / 0.24));
        const pSubFinal = Math.max(0, pSubEnter * (1 - exitProgress));
        const subY = (1 - pSubEnter) * 18 - exitProgress * 16;
        const subBlur = (1 - pSubFinal) * 8;

        subheadingRef.current.style.opacity = String((pSubFinal * 0.75).toFixed(3));
        subheadingRef.current.style.transform = `translateY(${subY.toFixed(1)}px)`;
        subheadingRef.current.style.filter = subBlur > 0.1 ? `blur(${subBlur.toFixed(1)}px)` : 'none';
      }

      if (letterRefs.current.length === 0 && titleWrapRef.current) {
        titleWrapRef.current.style.opacity = String(enterProgress);
      }

      // Check transition from Home into Projects for magnetic cursor snap
      const currentScroll = window.scrollY;
      const vh = window.innerHeight;
      const projectsTop = containerRef.current ? containerRef.current.offsetTop : vh;

      if (wasAtHomeRef.current && Math.abs(currentScroll - projectsTop) < 35) {
        wasAtHomeRef.current = false;
        setTimeout(magnetizeToProject1, 100);
      } else if (currentScroll < projectsTop - 80) {
        if (!wasAtHomeRef.current) {
          wasAtHomeRef.current = true;
          unmagnetizeProject1();
        }
      } else if (currentScroll > projectsTop + 80) {
        unmagnetizeProject1();
      }
    };

    let lastMagnetTime = 0;
    const magnetizeToProject1 = () => {
      if (typeof window === 'undefined') return;
      const now = Date.now();
      if (now - lastMagnetTime < 400) return;
      lastMagnetTime = now;
      const cardWrap = imageWrapRefs.current[0];
      if (!cardWrap) return;
      const rect = cardWrap.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        const x = Math.round(rect.left + rect.width * 0.5);
        const y = Math.round(rect.top + rect.height * 0.5);
        window.dispatchEvent(
          new CustomEvent('rw-magnet-cursor', {
            detail: { x, y, isHovered: true },
          })
        );
        cardWrap.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      }
    };

    const unmagnetizeProject1 = () => {
      if (typeof window === 'undefined') return;
      imageWrapRefs.current[0]?.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
      window.dispatchEvent(new CustomEvent('rw-unmagnet-cursor'));
    };

    const tick = () => {
      // Clamp target to available range [0, maxTarget]
      state.target = Math.max(0, Math.min(maxTarget, state.target));

      // Momentum glide after the finger/pointer is released.
      if (
        !reduceMotion &&
        !state.isDragging &&
        Math.abs(state.velocity) > MIN_MOMENTUM
      ) {
        state.target = Math.max(0, Math.min(maxTarget, state.target + state.velocity));
        state.velocity *= MOMENTUM_FRICTION;
      } else if (!state.isDragging) {
        state.velocity = 0;
      }

      const lerpFactor = reduceMotion
        ? REDUCED_MOTION_LERP_FACTOR
        : state.isDragging
          ? DRAG_LERP_FACTOR
          : LERP_FACTOR;
      state.current = lerp(state.current, state.target, lerpFactor);

      // Snap cleanly to 0 when settling near initial position
      if (Math.abs(state.current) < 0.05 && state.target === 0) {
        state.current = 0;
      }

      // Snap cleanly to maxTarget when settling near end of projects
      if (Math.abs(state.current - maxTarget) < 0.05 && state.target === maxTarget) {
        state.current = maxTarget;
      }

      positionCards(state.current);
      updateTitleProgress();

      if (images.length) {
        const nextIndex = Math.min(
          images.length - 1,
          Math.max(0, Math.round(state.current / cardStep))
        );

        if (nextIndex !== announcedIndexRef.current) {
          if (announcedIndexRef.current === 0 && nextIndex > 0) {
            unmagnetizeProject1();
          }
          announcedIndexRef.current = nextIndex;
          setActiveIndex(nextIndex);
        }
      }

      state.raf = requestAnimationFrame(tick);
    };

    const getSectionOffsets = () => {
      const vh = window.innerHeight;
      const projectsEl = containerRef.current;
      const contactEl = document.getElementById('contact');

      const projectsTop = projectsEl ? projectsEl.offsetTop : vh;
      const contactTop = contactEl ? contactEl.offsetTop : vh * 2;

      const currentScrollY = window.scrollY;

      const isAtHome = currentScrollY < projectsTop - 40;
      const isAtProjects = currentScrollY >= projectsTop - 40 && currentScrollY < contactTop - 40;
      const isAtContact = currentScrollY >= contactTop - 40;

      return { vh, currentScrollY, projectsTop, contactTop, isAtHome, isAtProjects, isAtContact };
    };

    const smoothScrollTo = (targetY: number, onComplete?: () => void) => {
      if (typeof window === 'undefined') return;

      isTransitioningRef.current = true;
      gsap.killTweensOf(window);

      gsap.to(window, {
        scrollTo: { y: targetY, autoKill: false },
        duration: 0.85,
        ease: 'power2.inOut',
        overwrite: 'auto',
        onUpdate: () => {
          updateTitleProgress();
        },
        onComplete: () => {
          window.scrollTo(0, targetY);
          updateTitleProgress();
          setTimeout(() => {
            isTransitioningRef.current = false;
            cooldownRef.current = Date.now() + 250;
            onComplete?.();
          }, 50);
        },
      });
    };

    const onWheel = (event: WheelEvent) => {
      // 1. If currently in transition, swallow all wheel events
      if (isTransitioningRef.current) {
        event.preventDefault();
        return;
      }

      // 2. Cooldown check (absorb residual trackpad inertia from previous flick)
      if (Date.now() < cooldownRef.current) {
        event.preventDefault();
        return;
      }

      const { currentScrollY, projectsTop, contactTop, isAtHome, isAtProjects, isAtContact } = getSectionOffsets();

      // ─── CASE 1: USER IS IN HERO (HOME) ───────────────────────
      if (isAtHome) {
        if (event.deltaY > 0) {
          // Scrolling down from Home:
          // Immediately prevent native scroll so fast scrolls CANNOT overshoot past Projects!
          event.preventDefault();
          state.target = 0;
          state.current = 0;
          smoothScrollTo(projectsTop, () => magnetizeToProject1());
        } else {
          // Normal scroll up while at top of Home
          return;
        }
        return;
      }

      // ─── CASE 2: USER IS IN CONTACT ───────────────────────────
      if (isAtContact) {
        if (event.deltaY < 0) {
          // Scrolling up from Contact:
          // Smoothly glide back into Projects, initialized at the end of the project gallery!
          event.preventDefault();
          state.target = maxTarget;
          state.current = maxTarget;
          smoothScrollTo(projectsTop);
        } else {
          // Normal scroll down while at bottom of Contact
          return;
        }
        return;
      }

      // ─── CASE 3: INTERMEDIATE POSITION RECOVERY ───────────────
      // If user somehow ended up between sections (e.g. reload or resize)
      if (currentScrollY > 20 && currentScrollY < projectsTop - 40) {
        event.preventDefault();
        if (event.deltaY > 0) {
          state.target = 0;
          state.current = 0;
          smoothScrollTo(projectsTop, () => magnetizeToProject1());
        } else {
          unmagnetizeProject1();
          wasAtHomeRef.current = true;
          smoothScrollTo(0);
        }
        return;
      }
      if (currentScrollY > projectsTop + 40 && currentScrollY < contactTop - 40) {
        event.preventDefault();
        if (event.deltaY > 0) {
          unmagnetizeProject1();
          smoothScrollTo(contactTop);
        } else {
          state.target = maxTarget;
          state.current = maxTarget;
          smoothScrollTo(projectsTop);
        }
        return;
      }

      // ─── CASE 4: USER IS PINNED IN PROJECTS ───────────────────
      // Pin window scroll completely while interacting with projects
      event.preventDefault();

      if (event.deltaY > 0) {
        // Downward wheel scroll:
        if (state.target < maxTarget || state.current < maxTarget - 2) {
          // Advance the project horizontal slider
          state.target = Math.min(maxTarget, state.target + event.deltaY * SCROLL_PER_PX);
        } else {
          // Reached and settled on the final project card!
          // Next downward scroll smoothly glides to Contact
          unmagnetizeProject1();
          smoothScrollTo(contactTop);
        }
      } else if (event.deltaY < 0) {
        // Upward wheel scroll:
        if (state.target > 0 || state.current > 2) {
          // Scrub backwards through the project gallery
          state.target = Math.max(0, state.target + event.deltaY * SCROLL_PER_PX);
        } else {
          // Back at project 1!
          // Next upward scroll smoothly glides back to Home
          unmagnetizeProject1();
          wasAtHomeRef.current = true;
          smoothScrollTo(0);
        }
      }
    };

    const beginDrag = (clientX: number, clientY: number) => {
      state.isDragging = true;
      state.lastX = clientX;
      state.lastY = clientY;
      state.velocity = 0;
    };

    const moveDrag = (clientX: number, clientY: number, direction: number = 1) => {
      if (!state.isDragging) return;

      const deltaX = clientX - state.lastX;
      const deltaY = clientY - state.lastY;
      const rawDelta =
        Math.abs(deltaX) >= Math.abs(deltaY) ? -deltaX : -deltaY;
      const delta = rawDelta * direction;

      state.target = Math.max(0, Math.min(maxTarget, state.target + delta));
      state.velocity = lerp(state.velocity, delta, 0.5);
      state.lastX = clientX;
      state.lastY = clientY;
    };

    const endDrag = () => {
      state.isDragging = false;
    };

    const onMouseDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) return;
      beginDrag(event.clientX, event.clientY);
    };
    const onMouseMove = (event: MouseEvent) => moveDrag(event.clientX, event.clientY);
    const onMouseUp = endDrag;

    let touchStartY = 0;
    let touchStartX = 0;

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length > 0) {
        touchStartY = event.touches[0].clientY;
        touchStartX = event.touches[0].clientX;
      }
      if (!containerRef.current?.contains(event.target as Node)) return;
      beginDrag(event.touches[0].clientX, event.touches[0].clientY);
    };

    const onTouchMove = (event: TouchEvent) => {
      if (containerRef.current?.contains(event.target as Node)) {
        moveDrag(event.touches[0].clientX, event.touches[0].clientY, -1);
      }
    };

    const onTouchEnd = (event: TouchEvent) => {
      endDrag();
      if (isTransitioningRef.current || Date.now() < cooldownRef.current) return;
      if (!event.changedTouches.length) return;

      const touchEndY = event.changedTouches[0].clientY;
      const touchEndX = event.changedTouches[0].clientX;
      const diffY = touchStartY - touchEndY;
      const diffX = touchStartX - touchEndX;

      if (Math.abs(diffY) < 60 || Math.abs(diffY) < Math.abs(diffX) * 1.3) return;

      const { projectsTop, contactTop, isAtHome, isAtProjects, isAtContact } = getSectionOffsets();

      if (diffY > 0) {
        if (isAtHome) {
          state.target = 0;
          state.current = 0;
          smoothScrollTo(projectsTop, () => magnetizeToProject1());
        } else if (isAtProjects && (state.target >= maxTarget || state.current >= maxTarget - 2)) {
          unmagnetizeProject1();
          smoothScrollTo(contactTop);
        }
      } else {
        if (isAtContact) {
          state.target = maxTarget;
          state.current = maxTarget;
          smoothScrollTo(projectsTop);
        } else if (isAtProjects && (state.target <= 0 || state.current <= 2)) {
          unmagnetizeProject1();
          wasAtHomeRef.current = true;
          smoothScrollTo(0);
        }
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'BUTTON', 'A'].includes((event.target as HTMLElement)?.tagName)) {
        return;
      }
      if (isTransitioningRef.current || Date.now() < cooldownRef.current) return;

      const { projectsTop, contactTop, isAtHome, isAtProjects, isAtContact } = getSectionOffsets();

      if (event.key === 'ArrowDown' || event.key === 'PageDown' || (event.key === ' ' && !event.shiftKey)) {
        if (isAtHome) {
          event.preventDefault();
          state.target = 0;
          state.current = 0;
          smoothScrollTo(projectsTop, () => magnetizeToProject1());
        } else if (isAtProjects) {
          event.preventDefault();
          if (state.target < maxTarget - 1) {
            state.target = Math.min(maxTarget, state.target + cardStep);
          } else {
            unmagnetizeProject1();
            smoothScrollTo(contactTop);
          }
        }
      } else if (event.key === 'ArrowUp' || event.key === 'PageUp' || (event.key === ' ' && event.shiftKey)) {
        if (isAtContact) {
          event.preventDefault();
          state.target = maxTarget;
          state.current = maxTarget;
          smoothScrollTo(projectsTop);
        } else if (isAtProjects) {
          event.preventDefault();
          if (state.target > 1) {
            state.target = Math.max(0, state.target - cardStep);
          } else {
            unmagnetizeProject1();
            wasAtHomeRef.current = true;
            smoothScrollTo(0);
          }
        }
      }
    };

    const onCustomNav = (e: Event) => {
      const customEvent = e as CustomEvent<{ target: string }>;
      const target = customEvent.detail?.target;
      const { projectsTop, contactTop } = getSectionOffsets();

      if (target === 'home') {
        unmagnetizeProject1();
        wasAtHomeRef.current = true;
        smoothScrollTo(0);
      } else if (target === 'projects') {
        state.target = 0;
        state.current = 0;
        smoothScrollTo(projectsTop, () => magnetizeToProject1());
      } else if (target === 'contact') {
        unmagnetizeProject1();
        smoothScrollTo(contactTop);
      }
    };

    updateTitleProgress();
    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onTouchEnd);
    window.addEventListener('touchcancel', onTouchEnd);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('rw-nav', onCustomNav);
    window.addEventListener('scroll', updateTitleProgress, { passive: true });
    window.addEventListener('resize', updateTitleProgress);

    state.raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(state.raf as number);
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', onTouchEnd);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('rw-nav', onCustomNav);
      window.removeEventListener('scroll', updateTitleProgress);
      window.removeEventListener('resize', updateTitleProgress);
    };
  }, [cardStep, images, positionCards, reduceMotion]);

  useEffect(() => {
    if (!images.length) return;

    const cleanups: (() => void)[] = [];

    cardRefs.current.forEach((card, index) => {
      const textElement = textRefs.current[index];
      const imageWrap = imageWrapRefs.current[index];

      if (!card || !textElement || !imageWrap) return;

      const numberElement = textElement.querySelector('[data-number]');
      const titleElement = textElement.querySelector('[data-title]');
      const descElement = textElement.querySelector('[data-desc]');

      if (!numberElement || !titleElement || !descElement) return;

      const split = SplitText.create(
        [numberElement, titleElement, descElement],
        {
          type: 'lines',
          mask: 'lines',
        }
      );

      gsap.set(split.lines, { yPercent: 100 });
      gsap.set(textElement, { autoAlpha: 0 });

      const imageElement = imageWrap.querySelector('img');

      if (imageElement) {
        gsap.set(imageElement, { opacity: 1 });
      }

      const onEnter = () => {
        if (textOnHover) {
          if (reduceMotion) {
            gsap.killTweensOf([textElement, split.lines]);
            gsap.set(split.lines, { yPercent: 0 });
            gsap.to(textElement, {
              autoAlpha: 1,
              duration: REDUCED_MOTION_FADE_DURATION,
              ease: 'power2.out',
            });
          } else {
            gsap
              .timeline()
              .set(textElement, { autoAlpha: 1 })
              .to(split.lines, {
                yPercent: 0,
                duration: 0.55,
                stagger: 0.05,
                ease: 'power3.out',
              });
          }
        }

        if (!imageElement || !scaleOnHover || reduceMotion) return;

        gsap.to(imageElement, {
          scale: 1.05,
          duration: 0.6,
          ease: 'power2.out',
        });
      };

      const onLeave = () => {
        if (textOnHover) {
          if (reduceMotion) {
            gsap.killTweensOf([textElement, split.lines]);
            gsap.to(textElement, {
              autoAlpha: 0,
              duration: REDUCED_MOTION_FADE_DURATION,
              ease: 'power2.out',
              onComplete: () => gsap.set(split.lines, { yPercent: 100 }),
            });
          } else {
            gsap.to(split.lines, {
              yPercent: 100,
              duration: 0.28,
              stagger: 0.03,
              ease: 'power2.in',
              onComplete: () => gsap.set(textElement, { autoAlpha: 0 }),
            });
          }
        } else {
          gsap.killTweensOf([textElement, split.lines]);
          gsap.set(textElement, { autoAlpha: 0 });
          gsap.set(split.lines, { yPercent: 100 });
        }

        if (!imageElement || !scaleOnHover) return;

        gsap.to(imageElement, {
          scale: 1,
          duration: 0.6,
          ease: 'power2.out',
        });
      };

      imageWrap.addEventListener('mouseenter', onEnter);
      imageWrap.addEventListener('mouseleave', onLeave);

      cleanups.push(() => {
        imageWrap.removeEventListener('mouseenter', onEnter);
        imageWrap.removeEventListener('mouseleave', onLeave);
        split.revert();
      });
    });

    return () => cleanups.forEach((cleanup) => cleanup());
  }, [images, reduceMotion, scaleOnHover, textOnHover]);

  const activeItem = images[activeIndex];
  const slideAnnouncement = images.length
    ? activeItem?.title
      ? `${activeItem.title}, slide ${activeIndex + 1} of ${images.length}`
      : `Slide ${activeIndex + 1} of ${images.length}`
    : '';

  return (
    <div
      ref={containerRef}
      id="projects"
      className={`relative w-full overflow-hidden bg-[#fafafa] dark:bg-black text-[#0a0a0a] dark:text-white transition-colors duration-300 ${className || ''}`}
      style={{ height: '100svh', touchAction: 'none' }}
    >
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {slideAnnouncement}
      </div>
      {title ? (
        <div className="pointer-events-none absolute left-6 sm:left-10 md:left-16 lg:left-20 top-24 sm:top-28 md:top-32 lg:top-36 z-20 text-left">
          <h2
            ref={titleWrapRef}
            aria-label={typeof title === "string" ? title : "PROJECTS"}
            className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-black uppercase tracking-tight text-[#0a0a0a] dark:text-white leading-[0.85] select-none transition-colors duration-300"
          >
            {typeof title === "string" && title.toUpperCase() === "PROJECTS" ? (
              <span aria-label="PROJECTS">
                <span className="block overflow-visible whitespace-nowrap">
                  {['P', 'R', 'O'].map((char, i) => (
                    <span
                      key={i}
                      ref={(el) => {
                        letterRefs.current[i] = el;
                      }}
                      aria-hidden="true"
                      className="inline-block will-change-[opacity,transform,filter]"
                      style={{
                        opacity: 0,
                        transform: 'translateY(36px) scale(0.92)',
                        filter: 'blur(12px)',
                        display: 'inline-block',
                      }}
                    >
                      {char}
                    </span>
                  ))}
                </span>
                <span className="block overflow-visible whitespace-nowrap">
                  {['J', 'E', 'C', 'T', 'S'].map((char, i) => (
                    <span
                      key={i + 3}
                      ref={(el) => {
                        letterRefs.current[i + 3] = el;
                      }}
                      aria-hidden="true"
                      className="inline-block will-change-[opacity,transform,filter]"
                      style={{
                        opacity: 0,
                        transform: 'translateY(36px) scale(0.92)',
                        filter: 'blur(12px)',
                        display: 'inline-block',
                      }}
                    >
                      {char}
                    </span>
                  ))}
                </span>
              </span>
            ) : (
              title
            )}
          </h2>
          {subheading ? (
            <p
              ref={subheadingRef}
              className="mt-3 sm:mt-4 text-xs sm:text-sm tracking-[0.1em] text-neutral-600 dark:text-white/65 font-medium will-change-[opacity,transform,filter] flex items-center gap-2 transition-colors duration-300"
              style={{
                opacity: 0,
                transform: 'translateY(18px)',
                filter: 'blur(8px)',
              }}
            >
              <span>{subheading}</span>
              <span className="text-[#84a30a] dark:text-[#C3E41D] font-mono font-bold tracking-wider text-[11px] sm:text-xs">
                [{String(activeIndex + 1).padStart(2, '0')}&thinsp;/&thinsp;{String(images.length).padStart(2, '0')}]
              </span>
            </p>
          ) : null}
        </div>
      ) : null}

      <div ref={stripRef} className="absolute inset-0">
        {images.map((item, index) => (
          <div
            key={index}
            ref={(element) => {
              cardRefs.current[index] = element;
            }}
            className="absolute left-0 top-0"
            style={{ willChange: 'transform' }}
          >
            <div
              ref={(element) => {
                textRefs.current[index] = element;
              }}
              className="absolute z-10 flex w-full flex-col gap-1.25"
              style={{
                bottom: 'calc(100% + 10px)',
                left: 0,
                padding: '0 0 4px',
                visibility: 'hidden',
              }}
            >
              <p
                data-number
                className="overflow-hidden select-none text-[10px] font-bold uppercase leading-none tracking-[0.18em] text-neutral-500 dark:text-white/50 transition-colors duration-300"
              >
                {item.number}
              </p>

              <p
                data-title
                className="overflow-hidden select-none text-[13px] font-extrabold uppercase leading-[1.15] tracking-[0.08em] text-[#0a0a0a] dark:text-white transition-colors duration-300"
              >
                {item.title}
              </p>

              <p
                data-desc
                className="overflow-hidden text-[10px] select-none font-normal leading-normal tracking-[0.04em] text-neutral-600 dark:text-white/60 transition-colors duration-300"
              >
                {item.desc}
              </p>
            </div>

            <div
              ref={(element) => {
                imageWrapRefs.current[index] = element;
              }}
              className="relative overflow-hidden shadow-xl shadow-black/10 dark:shadow-none transition-shadow duration-300"
              style={{
                width: cardWidthMin,
                height: cardHeightMax,
                willChange: 'width, height',
              }}
            >
              <img
                src={item.src}
                alt={item.title}
                draggable={false}
                className="pointer-events-none absolute inset-0 select-none object-cover opacity-0 w-full h-full"
                style={{
                  transform: 'none',
                  objectPosition: 'center bottom',
                  transition: 'none',
                  willChange: 'auto',
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export interface ZoomSliderProps {
  title?: React.ReactNode;
  subheading?: string;
  sliderData?: ZoomSliderItem[];
  scaleOnHover?: boolean;
  textOnHover?: boolean;
  size?: number;
  easeScrollPercentage?: number;
  className?: string;
}

const ZoomSlider = ({
  title = "Zoom Slider",
  subheading = "Scroll to explore",
  sliderData = DEFAULT_SLIDER_DATA,
  scaleOnHover = true,
  textOnHover = true,
  size = 1,
  easeScrollPercentage = 100,
  className,
}: ZoomSliderProps = {}) => (
  <ZoomSliderComp
    title={title}
    subheading={subheading}
    sliderData={sliderData}
    scaleOnHover={scaleOnHover}
    textOnHover={textOnHover}
    size={size}
    easeScrollPercentage={easeScrollPercentage}
    className={className}
  />
);

export default ZoomSlider;