import PortfolioHero from "@/components/ui/portfolio-hero";
import ZoomSlider from "@/components/ui/zoom-slider";
import ContactSection from "@/components/ui/contact-section";
import { PROJECTS_DATA } from "@/lib/projects";

export default function Home() {
  return (
    <div className="relative w-full bg-[#fafafa] dark:bg-black text-[#0a0a0a] dark:text-white selection:bg-[#C3E41D] selection:text-black transition-colors duration-300">
      <PortfolioHero />
      <ZoomSlider
        title="PROJECTS"
        subheading="Scroll or drag to explore"
        sliderData={PROJECTS_DATA}
        scaleOnHover
        textOnHover
        size={1}
        easeScrollPercentage={100}
      />
      <ContactSection />
    </div>
  );
}

