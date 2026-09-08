import { assetUrl } from "@/lib/utils";

export interface ProjectItem {
  number: string;
  src: string;
  title: string;
  desc: string;
}

const SOON_IMAGE = assetUrl("/projects/soon.jpg");

export const PROJECTS_DATA: ProjectItem[] = [
  // ─── Vos 4 vrais projets (1 à 4) ───────────────────────────
  {
    number: "01",
    src: assetUrl("/projects/project-1.jpg"),
    title: "AURA",
    desc: "Soft light and atmospheric tones",
  },
  {
    number: "02",
    src: assetUrl("/projects/project-2.jpg"),
    title: "DRIFT",
    desc: "Floating through silence",
  },
  {
    number: "03",
    src: assetUrl("/projects/project-3.jpg"),
    title: "FORM",
    desc: "Shapes carved by light",
  },
  {
    number: "04",
    src: assetUrl("/projects/project-4.jpg"),
    title: "FLOW",
    desc: "Smooth transitions in motion",
  },

  // ─── Projets à venir (5 à 10) avec l'image soon ──────────
  {
    number: "05",
    src: SOON_IMAGE,
    title: "SOON",
    desc: "Coming soon",
  },
  {
    number: "06",
    src: SOON_IMAGE,
    title: "SOON",
    desc: "Coming soon",
  },
  {
    number: "07",
    src: SOON_IMAGE,
    title: "SOON",
    desc: "Coming soon",
  },
  {
    number: "08",
    src: SOON_IMAGE,
    title: "SOON",
    desc: "Coming soon",
  },
  {
    number: "09",
    src: SOON_IMAGE,
    title: "SOON",
    desc: "Coming soon",
  },
  {
    number: "10",
    src: SOON_IMAGE,
    title: "SOON",
    desc: "Coming soon",
  },
];
