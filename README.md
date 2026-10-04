# Portfolio Robin Wattier — Galerie Projets

Ce projet reproduit fidèlement la galerie de l'onglet **Playground** du site de référence [iamnotsrc.com](https://www.iamnotsrc.com/#playground), conçue selon les principes de design minimaliste, de fluidité de défilement et de haute réactivité de la compétence `/ui-ux-pro-max`.

---

## ✦ Caractéristiques implémentées

1. **Barre de Navigation Fixe (Sticky/Fixed)** :
   - Reste toujours ancrée en haut de l'écran (`position: fixed; z-index: 100;`).
   - Finition en verre dépoli ultra-élégante (`backdrop-filter: blur(16px)` avec le fond beige chaud `#f5f4f0`).
   - Seul le contenu de la galerie défile sous la barre.
   - À gauche : Nom de marque minimaliste (`robin wattier`).
   - À droite en mode ordinateur : Trois boutons pilules :
     - **Intro** (`pill-ghost`)
     - **Projets** (`pill-ghost active`, sélectionné par défaut)
     - **Contact/Follow** (`pill-solid`, bouton d'action sombre)

2. **Menu Hamburger Responsive (Tablettes & Mobiles)** :
   - Dès que l'écran passe sous 768px, les boutons de la barre se regroupent dans un menu hamburger minimaliste à 3 barres animées.
   - Au clic, l'icône se transforme en croix fine et un tiroir défile sous la barre fixe avec les trois boutons.

3. **Galerie Masonry Fluide & Ultra Responsive** :
   - **Écrans larges (> 1200px)** : 5 colonnes dynamiques avec espacement de 10px.
   - **Ordinateurs portables (900px - 1200px)** : 4 colonnes.
   - **Tablettes (560px - 900px)** : 3 colonnes.
   - **Mobiles (≤ 560px)** : Maçonnerie 2 colonnes avec calcul d'alternance dynamique pour éliminer tout saut visuel (CLS = 0) et équilibrer parfaitement les hauteurs de colonnes.
   - Coins arrondis (`14px`), micro-animations au survol (`scale(1.035)`).
   - Vidéos en boucle silencieuses : lecture automatique et fluide au survol de la souris.

4. **Modale Lightbox Plein Écran** :
   - Fond avec flou cinématographique (`backdrop-filter: blur(24px)`).
   - Affichage haute fidélité pour images et vidéos en lecture directe avec contrôles.
   - Boutons précédent / suivant / fermeture en verre translucide.
   - Compteur de projet dynamique (`04 / 60`).
   - Navigation tactile (swipe gauche/droite pour naviguer, swipe bas pour fermer).
   - Glisser-déposer à la souris et raccourcis clavier (`Flèche gauche`, `Flèche droite`, `Échap`).

5. **Défilement & Bouton « Retour en haut »** :
   - Effet d'apparition échelonnée des cartes au défilement (`IntersectionObserver`).
   - Bouton flottant circulaire en bas à droite qui apparaît dès 300px de scroll et remonte avec une animation fluide.

---

## ✦ Structure des fichiers

- [`index.html`](file:///c:/Users/Robin/Documents/datanomade/projets/sites-apps/site-robin-wattier-2/index.html) : Structure HTML sémantique, barre fixe, conteneur de grille et modale Lightbox.
- [`style.css`](file:///c:/Users/Robin/Documents/datanomade/projets/sites-apps/site-robin-wattier-2/style.css) : Tokens de design, règles de mise en page, maçonnerie responsive et styles de la Lightbox.
- [`projects-data.js`](file:///c:/Users/Robin/Documents/datanomade/projets/sites-apps/site-robin-wattier-2/projects-data.js) : Base de données des créations (images et vidéos avec dimensions natives et affiches).
- [`script.js`](file:///c:/Users/Robin/Documents/datanomade/projets/sites-apps/site-robin-wattier-2/script.js) : Rendu dynamique de la grille, maçonnerie mobile, lightbox avec gestes tactiles et navigation.
- `assets/` : Dossier contenant les favicons, les polices typographiques (`Montserrat`, `KCY2KBanger-Bold.otf`) et les sous-dossiers.
- `assets/projets/` : Dossier contenant l'ensemble des médias locaux (images, vidéos haute résolution et affiches/miniatures).

---

## ✦ Comment personnaliser vos projets

Ouvrez simplement [`projects-data.js`](file:///c:/Users/Robin/Documents/datanomade/projets/sites-apps/site-robin-wattier-2/projects-data.js) et ajoutez vos propres éléments :

```javascript
{
  "src": "assets/projets/mon-image.webp", // Ou une URL externe
  "title": "Nom de votre projet",
  "type": "image", // ou "video"
  "w": 1080,      // Largeur de référence
  "h": 1400,      // Hauteur de référence
  "poster": "assets/projets/miniature.webp" // Si type === "video"
}
```

Pour les sections futures **Intro** et **Contact/Follow**, les conteneurs `#page-intro` et `#page-contact` sont déjà prêts dans `index.html` et peuvent être enrichis directement.
