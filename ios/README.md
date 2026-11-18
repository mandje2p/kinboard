# Kinboard pour iPad (coque native + Apple Home)

Une page web ne peut pas parler à Apple Home (HomeKit). Cette petite application
iPad affiche **Kinboard** en plein écran et lui prête l'accès à HomeKit : le widget
« Maison » de Kinboard peut alors afficher et commander tes lumières, prises et
thermostats Apple Home, sans Home Assistant.

```
iPad : app Kinboard (Swift)
  ├─ web view  ──────────►  https://maison.2points.fr   (toute l'interface)
  └─ pont HomeKit  ◄────►  window.kinboardNative.home   (lumières, prises, thermostats)
```

## Ce qu'il te faut
- Un **Mac avec Xcode 15 ou plus récent**.
- Un **compte développeur Apple** (la capacité HomeKit en a besoin).
- Ton **iPad**, relié au Mac par câble, avec le **Mode développeur** activé
  (Réglages > Confidentialité et sécurité > Mode développeur).
- Home configuré sur cet iPad : mêmes identifiants Apple que ta maison, et ton
  HomePod/Apple TV comme centre de contrôle.
- Le widget « Maison » déployé sur ton site (Réglages > Widgets > Maison).

## Installation (≈ 15 minutes)

### 1. Récupérer le code
```bash
git clone https://github.com/mandje2p/kinboard.git
cd kinboard && git checkout feature/resizable-grid
cd ios
```

### 2. Générer le projet Xcode
```bash
brew install xcodegen
xcodegen generate
open KinboardShell.xcodeproj
```
(Pas de Homebrew ? Voir « Créer le projet à la main » plus bas.)

### 3. Signer l'app
Dans Xcode : clique sur le projet **KinboardShell** > cible **KinboardShell** >
**Signing & Capabilities** :
- **Team** : choisis ton compte développeur ;
- **Bundle Identifier** : `fr.2points.kinboard` (change-le s'il est déjà pris) ;
- la capacité **HomeKit** doit apparaître (elle vient de `project.yml`). Si Xcode
  affiche une erreur de profil, clique sur « Try Again ».

### 4. Installer sur l'iPad
1. Choisis ton iPad dans la liste des destinations (en haut de Xcode).
2. **Run** (▶ ou ⌘R).
3. Au premier lancement, iPadOS demande l'accès à **Maison** : **Autoriser**.
4. Si l'iPad refuse d'ouvrir l'app : Réglages > Général > VPN et gestion de
   l'appareil > fais confiance à ton compte développeur.

### 5. Vérifier
Ouvre Kinboard dans l'app, connecte-toi à ta famille, puis le widget **Maison**
doit lister tes appareils. S'il dit « Disponible dans l'application iPad
Kinboard », tu es dans Safari et pas dans l'app.

## Utilisation au quotidien
- L'écran reste allumé tant que l'app est au premier plan (idéal pour un mur).
- Active l'**Accès guidé** (Réglages > Accessibilité) pour verrouiller l'iPad sur
  l'app.
- Pour changer l'adresse du site : `KinboardShell/AppConfig.swift`.

## Limites connues (v1)
- **Reconnecter Google Agenda** ne peut pas se faire dans l'app : Google refuse
  la connexion dans une vue web intégrée, donc le lien s'ouvre dans Safari. Fais
  la reconnexion depuis Safari (connecté à Kinboard aussi). Les agendas déjà
  connectés continuent de se synchroniser normalement.
- Sont gérés : **lumières** (marche/arrêt, luminosité), **prises**,
  **interrupteurs**, **thermostats** (consigne et mode). Pas encore : couleurs,
  volets, serrures, caméras, scènes.
- Les notifications push et le cache hors connexion de la PWA ne sont pas
  disponibles dans la coque.
- **Compte développeur gratuit** : l'app expire au bout de 7 jours et il faut la
  réinstaller (et la capacité HomeKit peut être refusée).
- Je n'ai pas pu compiler ce code (pas de Xcode dans mon environnement) : s'il y a
  une erreur de compilation, copie le message, c'est en général une ligne à
  corriger.

## Créer le projet à la main (sans xcodegen)
1. Xcode > File > New > Project > **iOS > App** (Interface SwiftUI, langage Swift),
   nom **Kinboard**, identifiant `fr.2points.kinboard`, destination **iPad**.
2. Supprime les fichiers Swift créés, puis glisse les 6 fichiers de
   `KinboardShell/*.swift` dans le projet (« Copy items if needed » coché).
3. Onglet **Signing & Capabilities** > **+ Capability** > **HomeKit**.
4. Onglet **Info** : ajoute `Privacy - HomeKit Usage Description` =
   « Kinboard affiche et commande vos lumières, prises et thermostats Apple Home. »
5. General > Deployment Info : iPad seulement, iOS 16.0 ou plus ; coche
   « Requires full screen » et masque la barre d'état.

## Dépannage
| Symptôme | Piste |
|---|---|
| Widget : « Autorisez Kinboard à utiliser Maison » | Réglages iPad > Kinboard > Maison : activer |
| Widget : « Aucune lumière… trouvé » | Ces appareils sont-ils bien dans l'app Maison de *cet* iCloud ? |
| Page blanche | Ouvre `https://maison.2points.fr` dans Safari : le site répond-il ? |
| Erreur HomeKit au lancement | Capacité HomeKit absente : voir étape 3 |
| Inspecter la page | Réglages Safari > Avancé > Inspecteur web, puis Safari Mac > Développement |
