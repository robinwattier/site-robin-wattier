import { assetUrl } from "@/lib/utils";

export interface ProjectDescPart {
  text: string;
  url?: string;
}

export interface ProjectItem {
  number: string;
  src: string;
  isVideo?: boolean;
  title: string;
  desc: string;
  descLink?: {
    text: string;
    url: string;
  };
  descParts?: ProjectDescPart[];
  link?: string;
  linkLabel?: string;
  linkPrefix?: string;
}

const SOON_IMAGE = assetUrl("/projects/soon.jpg");

export const PROJECTS_DATA: ProjectItem[] = [
  // ─── Vos 4 vrais projets (1 à 4) ───────────────────────────
  {
    number: "01",
    src: assetUrl("/projects/danelec.jpg"),
    title: "Danelec",
    desc: "web site",
    link: "https://danelec.be/",
    linkLabel: "danelec.be",
    linkPrefix: "visit:",
  },
  {
    number: "02",
    src: assetUrl("/projects/oto-color.jpg"),
    title: "OTO color",
    desc: "landing page, AI software, feat nico gems",
    descParts: [
      { text: "landing page, AI software, feat " },
      { text: "nico gems", url: "https://www.instagram.com/nico_gems/?hl=en" },
    ],
    link: "https://robinwattier.github.io/rw-gems-oto-color-landing-page/",
    linkLabel: "OTO color",
    linkPrefix: "visit:",
  },
  {
    number: "03",
    src: assetUrl("/projects/trap-city.mp4"),
    isVideo: true,
    title: "Trap City",
    desc: "audiovisual",
    link: "https://youtu.be/oydJdu7i1Lc?list=RDMMoydJdu7i1Lc",
    linkLabel: "Trap City",
    linkPrefix: "visit:",
  },
  {
    number: "04",
    src: assetUrl("/projects/ch1mera.mp4"),
    isVideo: true,
    title: "CH1MERA",
    desc: "41 audiovisual feat CH1MERA and Trinsic",
    descParts: [
      { text: "41 audiovisual feat " },
      { text: "CH1MERA", url: "https://www.instagram.com/ch1m3ra_/?hl=en" },
      { text: " and " },
      { text: "Trinsic", url: "https://www.instagram.com/trinsic.music/?hl=en" },
    ],
    link: "https://www.instagram.com/p/DV32A1nAakB/?hl=en",
    linkLabel: "CH1MERA",
    linkPrefix: "visit:",
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
