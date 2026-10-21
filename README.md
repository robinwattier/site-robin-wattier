# Portfolio — Robin Wattier

Site web portfolio officiel de **Robin Wattier**, créateur de contenu digital, motion designer et créatif multidisciplinaire basé en Belgique.

---

## ✦ Présentation du projet

Ce portfolio est conçu selon une esthétique minimaliste, tactile et cinétique de très haute précision, avec une navigation fluide, une typographie soignée et une expérience utilisateur sans compromis (zéro saut visuel CLS, animations physiques, gestion tactile complète).

---

## ✦ Fonctionnalités & Architecture

### 1. Navigation & En-tête Fixe
- **Barre supérieure en verre dépoli** (`backdrop-filter: blur(16px)` avec fond beige chaud).
- **Navigation par onglets** :
  - **Intro** : Présentation du studio, biographie, boutons d'action rapides et défilement infini des partenaires (« *Trusted by* »).
  - **Content** : Galerie principale de réalisations (vidéos, carrousels, liens officiels, créations Instagram).
  - **Shop** : Bouton d'accès direct à la boutique avec notification interactive.
  - **Contact/Follow** : Accès direct aux réseaux et liens officiels via Linktree.
- **Menu mobile tactile** : Menu hamburger responsive avec transition fluide pour écrans tactiles et smartphones.

### 2. Défilement infini « Trusted by »
- Bandeau cinétique motorisé en `requestAnimationFrame` présentant les partenaires et labels de confiance (Trap City, House City, Wave City, DanElec, CH1M3RA, Trinsic, Ville de Mons, etc.).
- Équilibrage optique des logos vectoriels et infobulles élégantes au survol.

### 3. Galerie de Projets Interactive (Section Content)
- **Maçonnerie dynamique 2 à 5 colonnes** ultra-réactive adaptée à chaque résolution d'écran.
- **Carrousels interactifs** : Navigation tactile par swipe ou clics sur les flèches directionnelles `<` et `>`, pastilles de pagination cliquables avec pastille active allongée (style Instagram), défilement fluide au survol et badge multi-post.
- **Reels & Vidéos** : Miniature statique à l'arrêt, badge Play circulaire blanc, **lecture fluide en boucle au survol OU au clic direct sur la carte/badge** (avec toggle lecture/pause), et ouverture grand écran dans la Lightbox par double-clic ou bouton d'agrandissement.
- **Badges contextuels** : Distinction visuelle immédiate des types de contenus (vidéos, liens externes, PDF, carrousels).

### 4. Modale Lightbox Plein Écran
- Flou d'arrière-plan cinématographique (`backdrop-filter: blur(24px)`).
- Navigation tactile native (gestes de glissement / swipe gauche, droite et bas).
- Contrôle clavier complet (`Échap`, `Flèche Gauche`, `Flèche Droite`) et glisser-déposer à la souris.
- Prise en charge des carrousels avec ouverture directe sur la diapositive visualisée dans la grille.
- Compteur dynamique de projets.

### 5. Synchronisation Automatique Instagram
- Script autonome [`sync-instagram.js`](sync-instagram.js) exécutant une capture haute fidélité du profil public ([@robinwattier](https://www.instagram.com/robinwattier/)) sans dépendance à des jetons API officiels Meta.
- **Filtrage strict par baseline** : Seuls les futurs posts publiés après l'installation sont importés, protégeant l'ensemble des créations existantes contre toute réimportation.
- **Tri automatique** : Détection intelligente des Carrousels, Reels/Vidéos et Photos.
- Téléchargement et hébergement local des médias haute résolution dans `assets/projets/instagram/` pour garantir une disponibilité permanente sans rupture de liens CDN.
- Tâche d'arrière-plan périodique intégrée au serveur Node.js (`server.js`) avec exclusion mutuelle (`isSyncing`) et mise à jour synchronisée de `data.json` et `projects-data.js`.

---

## ✦ Structure des fichiers

```text
├── index.html              # Page principale, structure sémantique & sections
├── style.css               # Système de design, typographies, maçonnerie & animations
├── script.js               # Logique de navigation, maçonnerie dynamique & lightbox
├── projects-data.js        # Base de données front-end des projets
├── data.json               # Données structurées des projets et métadonnées
├── server.js               # Serveur local Node.js avec streaming vidéo HTTP 206 et API sync
├── sync-instagram.js       # Scraper autonome Instagram vers portfolio
├── instagram-config.json   # Configuration de synchronisation Instagram
├── package.json            # Scripts npm et métadonnées du projet
└── assets/                 # Typographies, logos trusted, miniatures et vidéos de projets
```

---

## ✦ Installation et Lancement Local

1. **Démarrer le serveur local** :
   ```bash
   npm start
   ```
   Le site est accessible sur `http://localhost:3000`.

2. **Optimiser les médias (images WebP & vidéos compressées)** :
   ```bash
   npm run optimize
   ```
   Génère automatiquement les déclinaisons légères (WebP 480/800/1200w, vidéos d'aperçu au survol `.preview.mp4` et versions web légères `.web.mp4`).

3. **Lancer une synchronisation manuelle Instagram** :
   ```bash
   npm run sync
   ```

---

## ✦ Licence & Droits

© Robin Wattier. Tous droits réservés.
